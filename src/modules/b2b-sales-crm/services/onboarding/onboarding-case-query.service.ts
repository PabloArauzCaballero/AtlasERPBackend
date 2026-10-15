import { Injectable, NotFoundException } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { ListOnboardingCasesQueryDto } from '../../b2b-sales-crm.dtos';
import {
  ONBOARDING_TERMINAL_STATUS,
  type OnboardingCaseSnapshot,
  statusesForScope,
  summarizeOnboardingQueue,
} from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { ActivationContractResolver } from './activation-contract.resolver';
import { MerchantCredentialsReader } from './merchant-credentials.reader';
import { describeChecklistItem, requiresEvidence } from './onboarding-checklist.rules';
import { countPendingItems, describeCaseChain } from './onboarding-case.presenter';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** Las lecturas del alta: la cola, sus cifras y el detalle de un caso. */
@Injectable()
export class OnboardingCaseQueryService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly credentials: MerchantCredentialsReader,
    private readonly activationContract: ActivationContractResolver,
  ) {
    super(repository, logger);
  }

  /**
   * La cola de onboarding: sólo lo que falta por hacer, salvo que se pida el historial.
   *
   * Sin esta lectura la pantalla no tenía de dónde sacar los casos y pedía teclear el uuid a mano.
   * Y con la lectura sin filtro pasaba lo contrario: los comercios ya activados salían en la misma
   * tabla que los pendientes, así que la cola no se podía leer. El `scope` decide qué es trabajo
   * (ver `domain/onboarding-lifecycle.ts`), y se aplica en la consulta, no en el cliente.
   * Devuelve `tradeName` para que la fila diga «CPA Centro…» y no un hexadecimal.
   */
  async listOnboardingCases(query: ListOnboardingCasesQueryDto): Promise<Record<string, unknown>> {
    this.announce('listOnboardingCases');
    const statuses = query.status ? [query.status] : statusesForScope(query.scope);
    const where: Record<string | symbol, unknown> = { status: { [Op.in]: statuses } };
    if (query.accountId) where.accountId = query.accountId;

    const accountWhere = query.search
      ? {
          [Op.or]: [
            { tradeName: { [Op.iLike]: `%${query.search}%` } },
            { legalName: { [Op.iLike]: `%${query.search}%` } },
          ],
        }
      : undefined;

    const offset = (query.page - 1) * query.limit;
    const result = await this.repository.onboardingCases.findAndCountAll({
      where,
      include: [
        {
          model: this.repository.accounts,
          required: true,
          ...(accountWhere ? { where: accountWhere } : {}),
        },
        this.repository.checklistItems,
        {
          model: this.repository.contractVersions,
          required: false,
          include: [this.repository.contracts],
        },
      ],
      /* El ATRIBUTO del modelo, no la columna: con `started_at` Sequelize genera una referencia
         que Postgres no resuelve dentro de la subconsulta que produce `limit` + `include`. */
      order: [['startedAt', 'DESC']],
      limit: query.limit,
      offset,
      distinct: true,
    });

    const credentialsByAccount = await this.credentials.byAccount(
      result.rows.map((row) => row.accountId),
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      tradeName: row.account?.tradeName ?? row.account?.legalName ?? null,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      pendingItems: countPendingItems(row.checklistItems ?? []),
      ...describeCaseChain(row),
      ...this.credentials.describe(credentialsByAccount.get(row.accountId) ?? []),
      /* `requiresEvidence`/`hasEvidence`, como en el detalle: el modal de evidencia abre desde la
         cola y sin ellos no sabía si el requisito pide archivo ni si ya lo tiene. */
      checklistItems: (row.checklistItems ?? []).map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        status: item.status,
        requiresEvidence: requiresEvidence(item.itemType),
        hasEvidence: Boolean(item.evidenceStorageKey),
      })),
    }));

    return {
      items,
      page: query.page,
      limit: query.limit,
      total: result.count,
      totalPages: Math.ceil(result.count / query.limit),
    };
  }

  /**
   * Las cifras del mini-tablero, contadas sobre TODOS los casos y con la misma regla que aplica la
   * activación. Un tablero que afirma «3 listos» con una regla distinta a la del botón convence a
   * quien lo lee de algo que el backend va a rechazar.
   */
  async summarizeOnboardingQueue(): Promise<Record<string, unknown>> {
    this.announce('summarizeOnboardingQueue');
    const rows = await this.repository.onboardingCases.findAll({
      include: [this.repository.checklistItems],
    });

    // El contrato sólo importa para los que podrían activarse: consultarlo para los ya activados
    // sería trabajo para no usarlo. Y se resuelve con la MISMA función que la activación —el
    // pactado en el caso, o el activo de la cuenta— para que «listo» aquí sea «listo» allí.
    const snapshots: OnboardingCaseSnapshot[] = [];
    for (const row of rows) {
      const pendingItems = countPendingItems(row.checklistItems ?? []);
      const hasChecklistItems = (row.checklistItems ?? []).length > 0;
      const candidate =
        row.status !== ONBOARDING_TERMINAL_STATUS && hasChecklistItems && pendingItems === 0;
      snapshots.push({
        status: row.status,
        pendingItems,
        hasChecklistItems,
        hasActiveContract: candidate ? Boolean(await this.activationContract.resolve(row)) : false,
        motorApproved: row.decisionOutcome === 'APROBADO',
      });
    }

    return { ...summarizeOnboardingQueue(snapshots), total: rows.length };
  }

  async getOnboardingCase(id: string, transaction?: Transaction): Promise<Record<string, unknown>> {
    this.announce('getOnboardingCase');
    const include = [
      this.repository.checklistItems,
      this.repository.accounts,
      {
        model: this.repository.contractVersions,
        required: false,
        include: [this.repository.contracts],
      },
    ];
    const caseRecord = await this.repository.onboardingCases.findByPk(
      id,
      transaction ? { include, transaction } : { include },
    );

    if (!caseRecord) {
      throw new NotFoundException('Caso de onboarding no encontrado.');
    }

    return {
      id: caseRecord.id,
      accountId: caseRecord.accountId,
      ownerUserId: caseRecord.ownerUserId,
      status: caseRecord.status,
      startedAt: caseRecord.startedAt,
      completedAt: caseRecord.completedAt,
      ...describeCaseChain(caseRecord),
      ...this.credentials.describe(
        (await this.credentials.byAccount([caseRecord.accountId], transaction)).get(
          caseRecord.accountId,
        ) ?? [],
      ),
      checklistItems: caseRecord.checklistItems?.map((item) => describeChecklistItem(item)),
      /*
       * Las DOS condiciones que `activateOnboardingCase` comprueba de verdad antes de habilitar al
       * comercio. Se devuelven aqui para que la pantalla pueda decir en que estado esta cada una en
       * vez de dibujar cuatro comprobaciones siempre en verde: un panel que afirma «READY» sin haber
       * mirado nada es peor que no tener panel, porque convence a quien lo lee de que ya comprobo.
       */
      readiness: {
        pendingChecklistItems: countPendingItems(caseRecord.checklistItems ?? []),
        hasActiveContract: Boolean(await this.activationContract.resolve(caseRecord, transaction)),
        motorApproved: caseRecord.decisionOutcome === 'APROBADO',
      },
    };
  }
}
