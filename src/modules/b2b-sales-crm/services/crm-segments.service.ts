import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import {
  matchesDefinition,
  type SegmentDefinition,
} from '../../../common/segmentation/rule-engine';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CreateCrmSegmentDto,
  ListCrmSegmentsQueryDto,
  UpdateCrmSegmentDto,
} from '../b2b-sales-crm.dtos';
import {
  SUBJECT_LABELS,
  SUBJECT_NAMES,
  type CrmSegmentAttribute,
  type SegmentSubject,
  type SubjectFacts,
} from '../domain/crm-segments';
import { InternalUserModel } from '../models/b2b-sales-crm.models';
import { CrmSegmentModel } from '../models/crm-segment.model';
import { CrmSegmentsRepository } from '../repositories/crm-segments.repository';

export interface CrmSegmentView {
  id: string;
  subject: SegmentSubject;
  /** «Partner» / «Cliente solicitante»: lo que encabeza la columna, sin genitivo. */
  subjectLabel: string;
  name: string;
  description: string | null;
  status: string;
  /** Cuántos sujetos cumplen hoy la definición. Se recalcula en cada lectura, no se guarda. */
  size: number;
  /** Sobre cuántos se evaluó: sin esto, un alcance de 3 no dice si es de 10 o de 10.000. */
  population: number;
  /** Unos pocos miembros, para reconocer de un vistazo que el segmento agrupa lo que se cree. */
  sample: string[];
  /** La definición en una línea legible: el catálogo se audita leyendo, no abriendo JSON. */
  rules: string;
  /** La definición estructurada: es lo que permite corregir la regla sin volver a escribirla. */
  definition: SegmentDefinition<CrmSegmentAttribute>;
  ownerName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * El catálogo de segmentos comerciales.
 *
 * ## El alcance se calcula, no se guarda
 *
 * `size` sale de evaluar la definición contra los hechos de HOY en cada lectura. Guardarlo como
 * columna sería más barato y estaría mal casi siempre: la población cambia con cada compra y cada
 * cuota vencida, así que un número persistido envejece en horas y nadie sabría mirando la pantalla
 * si el «142» es de esta mañana o de marzo. Un número viejo presentado como actual es peor que no
 * tener número.
 *
 * ## Una proyección por sujeto y por lectura
 *
 * Los hechos se piden UNA vez por sujeto presente en el listado, no una vez por segmento: veinte
 * segmentos de partners cuestan la misma consulta que uno. Por eso el listado calcula el alcance
 * de todos y no hace falta un endpoint aparte para pedirlo de a uno.
 */
@Injectable()
export class CrmSegmentsService {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly repository: CrmSegmentsRepository,
    @InjectModel(CrmSegmentModel) private readonly segments: typeof CrmSegmentModel,
    @InjectModel(InternalUserModel) private readonly internalUsers: typeof InternalUserModel,
  ) {}

  async list(query: ListCrmSegmentsQueryDto): Promise<CrmSegmentView[]> {
    const where: Record<string, unknown> = {};
    if (query.subject) where.subject = query.subject;
    if (query.status) where.status = query.status;

    const rows = await this.segments.findAll({
      where,
      include: [{ model: InternalUserModel, required: false }],
      order: [
        ['subject', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    const facts = await this.factsForSubjects(new Set(rows.map((row) => row.subject)));
    return rows.map((row) => this.toView(row, facts.get(row.subject) ?? []));
  }

  async create(input: CreateCrmSegmentDto, user: AuthUser): Promise<CrmSegmentView> {
    const clash = await this.segments.findOne({
      where: { subject: input.subject, name: input.name },
    });
    if (clash) {
      throw new ConflictException(
        `Ya existe un segmento ${SUBJECT_LABELS[input.subject]} llamado «${input.name}».`,
      );
    }

    this.logger.infoContext(CrmSegmentsService.name, 'Creando segmento comercial', {
      subject: input.subject,
      name: input.name,
    });

    const created = await this.segments.create({
      subject: input.subject,
      name: input.name,
      description: input.description ?? null,
      definitionJson: input.definition,
      status: input.status ?? 'ACTIVE',
      ownerUserId: await this.resolveOwner(input.ownerUserId ?? user.sub),
    });

    return this.get(created.id);
  }

  async update(id: string, input: UpdateCrmSegmentDto): Promise<CrmSegmentView> {
    const segment = await this.find(id);

    if (input.name && input.name !== segment.name) {
      const clash = await this.segments.findOne({
        where: { subject: segment.subject, name: input.name },
      });
      if (clash) {
        throw new ConflictException(
          `Ya existe otro segmento ${SUBJECT_LABELS[segment.subject]} llamado «${input.name}».`,
        );
      }
    }

    /*
     * El SUJETO no se edita. Cambiarlo dejaría reglas válidas para el sujeto anterior mirando
     * atributos que el nuevo no tiene: el segmento seguiría existiendo y pasaría a contar cero sin
     * que nada indicara por qué. Para cambiar de sujeto se crea otro segmento.
     */
    await segment.update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.definition !== undefined ? { definitionJson: input.definition } : {}),
      ...(input.ownerUserId !== undefined
        ? { ownerUserId: await this.resolveOwner(input.ownerUserId) }
        : {}),
    });

    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string; name: string }> {
    const segment = await this.find(id);
    await segment.destroy();
    this.logger.infoContext(CrmSegmentsService.name, 'Segmento comercial eliminado', {
      subject: segment.subject,
      name: segment.name,
    });
    return { id, name: segment.name };
  }

  async get(id: string): Promise<CrmSegmentView> {
    const segment = await this.find(id);
    const facts = await this.factsForSubjects(new Set([segment.subject]));
    return this.toView(segment, facts.get(segment.subject) ?? []);
  }

  private async find(id: string): Promise<CrmSegmentModel> {
    const segment = await this.segments.findByPk(id, {
      include: [{ model: InternalUserModel, required: false }],
    });
    if (!segment) {
      throw new NotFoundException('Segmento no encontrado.');
    }
    return segment;
  }

  /**
   * El dueño es un usuario ERP, y sólo eso: si el identificador del token no corresponde a nadie
   * de `internal_users` —pasa con los accesos de servicio y con el bypass de desarrollo—, el
   * segmento se queda sin dueño en vez de reventar el alta con un error de clave foránea que no
   * dice nada de lo que el usuario estaba haciendo.
   */
  private async resolveOwner(candidate: string | null | undefined): Promise<string | null> {
    if (!candidate) return null;
    const exists = await this.internalUsers.findByPk(candidate, { attributes: ['id'] });
    return exists ? candidate : null;
  }

  private async factsForSubjects(
    subjects: Set<SegmentSubject>,
  ): Promise<Map<SegmentSubject, SubjectFacts[]>> {
    const now = new Date();
    const entries = await Promise.all(
      [...subjects].map(async (subject): Promise<[SegmentSubject, SubjectFacts[]]> => [
        subject,
        subject === 'PARTNER'
          ? await this.repository.findPartnerFacts(now)
          : await this.repository.findCreditApplicantFacts(now),
      ]),
    );
    return new Map(entries);
  }

  private toView(segment: CrmSegmentModel, population: SubjectFacts[]): CrmSegmentView {
    const definition = segment.definitionJson;
    const members = population.filter((subject) => matchesDefinition(definition, subject.facts));

    return {
      id: segment.id,
      subject: segment.subject,
      subjectLabel: SUBJECT_NAMES[segment.subject],
      name: segment.name,
      description: segment.description,
      status: segment.status,
      size: members.length,
      population: population.length,
      sample: members.slice(0, 5).map((member) => member.label),
      rules: describeDefinition(definition),
      definition,
      ownerName: segment.owner?.fullName ?? null,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }
}

/** La definición en una línea: «rubro IN (FARMACIA, MERCADO) y ciudad = Santa Cruz». */
export function describeDefinition(
  definition: SegmentDefinition<CrmSegmentAttribute> | null | undefined,
): string {
  if (!definition || definition.rules.length === 0) return 'Sin reglas: alcanza a todos.';
  const join = definition.match === 'ANY' ? ' o ' : ' y ';
  return definition.rules
    .map((rule) => {
      if (rule.operator === 'EXISTS') return `${rule.attribute} tiene valor`;
      const value = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '');
      return `${rule.attribute} ${rule.operator} ${Array.isArray(rule.value) ? `(${value})` : value}`;
    })
    .join(join);
}
