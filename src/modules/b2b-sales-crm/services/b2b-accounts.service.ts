import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { AccountLifecycleStatus, OpportunityStage } from '../b2b-sales-crm.enums';
import type {
  BulkCreateAccountsDto,
  CreateAccountDto,
  CreateContactDto,
  ListAccountsQueryDto,
  QualifyAccountDto,
  SetAccountTaxIdDto,
  SetAccountDossierDto,
} from '../b2b-sales-crm.dtos';
import {
  toAccountResponse,
  toContactResponse,
  toOpportunityResponse,
} from '../b2b-sales-crm.mapper';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { Op, type Transaction } from 'sequelize';

@Injectable()
export class B2BAccountsService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly businessActionLogsService: BusinessActionLogsService,
  ) {
    super(repository, logger);
  }

  private async attachTags(
    accountId: string,
    names: string[],
    transaction: Transaction,
  ): Promise<void> {
    for (const name of names) {
      const [tag] = await this.repository.accountTags.findOrCreate({
        where: { name },
        defaults: { name },
        transaction,
      });
      await this.repository.accountTagLinks.findOrCreate({
        where: { accountId, tagId: tag.id },
        defaults: { accountId, tagId: tag.id },
        transaction,
      });
    }
  }

  async createAccount(input: CreateAccountDto, user: AuthUser): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'createAccount',
    });
    return this.repository.transaction(async (transaction) => {
      const duplicate = await this.repository.findAccountDuplicate(
        input.taxId,
        input.tradeName,
        transaction,
      );

      if (duplicate) {
        throw new ConflictException('Ya existe una cuenta B2B con NIT o nombre comercial similar.');
      }

      const account = await this.repository.accounts.create(
        {
          legalName: input.legalName,
          tradeName: input.tradeName,
          taxId: input.taxId ?? null,
          accountType: input.accountType,
          industry: input.industry ?? null,
          category: input.category,
          businessLine: input.businessLine,
          businessDescription: input.businessDescription ?? null,
          websiteUrl: input.websiteUrl ?? null,
          countryCode: input.countryCode,
          city: input.city ?? null,
          address: input.address ?? null,
          employeeCount: input.employeeCount ?? null,
          foundedYear: input.foundedYear ?? null,
          annualRevenue: input.annualRevenue?.toFixed(2) ?? null,
          lifecycleStatus: AccountLifecycleStatus.LEAD,
          ownerUserId: input.ownerUserId ?? user.sub,
          territoryId: input.territoryId ?? null,
          riskTier: input.riskTier ?? null,
          expectedMonthlyVolume: input.expectedMonthlyVolume?.toFixed(2) ?? null,
          notes: input.notes ?? null,
          ...camposDelExpediente(input.dossier),
        },
        { transaction },
      );

      const contact = await this.repository.contacts.create(
        {
          accountId: account.id,
          fullName: input.primaryContact.fullName,
          roleTitle: input.primaryContact.roleTitle ?? null,
          email: input.primaryContact.email ?? null,
          phone: input.primaryContact.phone ?? null,
          decisionRole: input.primaryContact.decisionRole ?? null,
          isPrimary: true,
        },
        { transaction },
      );
      await this.attachTags(account.id, input.tags, transaction);
      await account.reload({ include: [this.repository.accountTags], transaction });

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: 'CREATE_LEAD',
          changedByUserId: user.sub,
          newValues: toAccountResponse(account),
        },
        transaction,
      );

      await this.businessActionLogsService.record({
        moduleCode: 'B2B_SALES_CRM',
        businessProcess: 'B2B_ACCOUNT_ONBOARDING',
        actionCode: 'CREATE_ACCOUNT_WITH_PRIMARY_CONTACT',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'B2B_ACCOUNT',
        aggregateId: account.id,
        affectedTables: [
          'b2b_sales.b2b_accounts',
          'b2b_sales.b2b_contacts',
          'b2b_sales.audit_logs',
        ],
        affectedRecordCount: 3,
        status: 'SUCCESS',
        inputSummary: { tradeName: input.tradeName, hasTaxId: Boolean(input.taxId) },
        outputSummary: { accountId: account.id, contactId: contact.id },
        transaction,
      });

      return {
        account: toAccountResponse(account),
        primaryContact: toContactResponse(contact),
      };
    });
  }

  async bulkCreateAccounts(
    input: BulkCreateAccountsDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM bulk use case started', {
      useCase: 'bulkCreateAccounts',
      itemCount: input.items.length,
      batchExternalId: input.batchExternalId ?? null,
    });

    return this.repository.transaction(async (transaction) => {
      const createdAccounts: Array<Record<string, unknown>> = [];
      const createdContacts: Array<Record<string, unknown>> = [];

      for (const item of input.items) {
        const duplicate = await this.repository.findAccountDuplicate(
          item.taxId,
          item.tradeName,
          transaction,
        );

        if (duplicate) {
          throw new ConflictException(
            `Ya existe una cuenta B2B con NIT o nombre comercial similar: ${item.tradeName}.`,
          );
        }

        const account = await this.repository.accounts.create(
          {
            legalName: item.legalName,
            tradeName: item.tradeName,
            taxId: item.taxId ?? null,
            accountType: item.accountType,
            industry: item.industry ?? null,
            category: item.category,
            businessLine: item.businessLine,
            businessDescription: item.businessDescription ?? null,
            websiteUrl: item.websiteUrl ?? null,
            countryCode: item.countryCode,
            city: item.city ?? null,
            address: item.address ?? null,
            employeeCount: item.employeeCount ?? null,
            foundedYear: item.foundedYear ?? null,
            annualRevenue: item.annualRevenue?.toFixed(2) ?? null,
            lifecycleStatus: AccountLifecycleStatus.LEAD,
            ownerUserId: item.ownerUserId ?? user.sub,
            territoryId: item.territoryId ?? null,
            riskTier: item.riskTier ?? null,
            expectedMonthlyVolume: item.expectedMonthlyVolume?.toFixed(2) ?? null,
            notes: item.notes ?? null,
          },
          { transaction },
        );

        const contact = await this.repository.contacts.create(
          {
            accountId: account.id,
            fullName: item.primaryContact.fullName,
            roleTitle: item.primaryContact.roleTitle ?? null,
            email: item.primaryContact.email ?? null,
            phone: item.primaryContact.phone ?? null,
            decisionRole: item.primaryContact.decisionRole ?? null,
            isPrimary: true,
          },
          { transaction },
        );
        await this.attachTags(account.id, item.tags, transaction);
        await account.reload({ include: [this.repository.accountTags], transaction });

        await this.repository.audit(
          {
            entityName: 'b2b_accounts',
            entityId: account.id,
            action: 'BULK_CREATE_LEAD',
            changedByUserId: user.sub,
            newValues: toAccountResponse(account),
          },
          transaction,
        );

        createdAccounts.push(toAccountResponse(account));
        createdContacts.push(toContactResponse(contact));
      }

      await this.businessActionLogsService.record({
        moduleCode: 'B2B_SALES_CRM',
        businessProcess: 'B2B_ACCOUNT_ONBOARDING',
        actionCode: 'BULK_CREATE_ACCOUNTS_WITH_PRIMARY_CONTACTS',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'B2B_ACCOUNT_BATCH',
        aggregateId: input.batchExternalId ?? null,
        correlationId: input.batchExternalId ?? null,
        affectedTables: [
          'b2b_sales.b2b_accounts',
          'b2b_sales.b2b_contacts',
          'b2b_sales.audit_logs',
        ],
        affectedRecordCount:
          createdAccounts.length + createdContacts.length + createdAccounts.length,
        status: 'SUCCESS',
        inputSummary: { requestedItems: input.items.length },
        outputSummary: {
          createdAccounts: createdAccounts.length,
          createdContacts: createdContacts.length,
        },
        transaction,
      });

      return {
        batchExternalId: input.batchExternalId ?? null,
        totalRequested: input.items.length,
        totalCreated: createdAccounts.length,
        accounts: createdAccounts,
        primaryContacts: createdContacts,
      };
    });
  }

  async listAccounts(query: ListAccountsQueryDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'listAccounts',
    });
    const offset = (query.page - 1) * query.limit;
    const result = await this.repository.listAccounts({
      offset,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.businessLine ? { businessLine: query.businessLine } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      ...(query.includeArchived === 'true' ? { includeArchived: true } : {}),
    });

    return {
      items: result.rows.map(toAccountResponse),
      page: query.page,
      limit: query.limit,
      total: result.count,
      totalPages: Math.ceil(result.count / query.limit),
    };
  }

  async getAccount(id: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'getAccount',
    });
    const account = await this.repository.accounts.findByPk(id, {
      include: [this.repository.contacts, this.repository.accountTags],
    });

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    return {
      ...toAccountResponse(account),
      contacts: account.contacts?.map(toContactResponse) ?? [],
    };
  }

  /**
   * Archiva una cuenta (soft-delete reversible): la saca de los listados operativos sin borrar la
   * fila ni romper las referencias de contratos, facturas y auditoría que cuelgan de ella.
   */
  async archiveAccount(accountId: string, user: AuthUser): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'archiveAccount',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      if (account.archivedAt) {
        throw new ConflictException('La cuenta ya estaba archivada.');
      }

      account.archivedAt = new Date();
      await account.save({ transaction });
      await account.reload({ include: [this.repository.accountTags], transaction });

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: 'ARCHIVE',
          changedByUserId: user.sub,
          newValues: toAccountResponse(account),
        },
        transaction,
      );

      await this.businessActionLogsService.record({
        moduleCode: 'B2B_SALES_CRM',
        businessProcess: 'B2B_ACCOUNT_ONBOARDING',
        actionCode: 'ARCHIVE_ACCOUNT',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'B2B_ACCOUNT',
        aggregateId: account.id,
        affectedTables: ['b2b_sales.b2b_accounts', 'b2b_sales.audit_logs'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { accountId: account.id },
        outputSummary: { accountId: account.id, archivedAt: account.archivedAt },
        transaction,
      });

      return toAccountResponse(account);
    });
  }

  /** Deshace el archivado: la cuenta vuelve a aparecer en los listados con su estado intacto. */
  /**
   * El NIT de una cuenta creada cuando todavía era opcional. Sin él no se abre el onboarding ni la
   * carpeta del comercio en Atlas, y no había ninguna otra forma de ponérselo.
   */
  async setAccountTaxId(
    accountId: string,
    input: SetAccountTaxIdDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'setAccountTaxId',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });
      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      const otra = await this.repository.accounts.findOne({
        where: { taxId: input.taxId, id: { [Op.ne]: accountId } },
        transaction,
      });
      if (otra) {
        throw new ConflictException(
          `El NIT ${input.taxId} ya pertenece a la cuenta «${otra.tradeName}». Revise si la cuenta está duplicada.`,
        );
      }

      const oldValues = { taxId: account.taxId };
      account.taxId = input.taxId;
      await account.save({ transaction });
      await account.reload({ include: [this.repository.accountTags], transaction });

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: 'UPDATE',
          changedByUserId: user.sub,
          oldValues,
          newValues: toAccountResponse(account),
        },
        transaction,
      );

      return toAccountResponse(account);
    });
  }

  /**
   * Completa los datos del expediente que no se capturaron al registrar la empresa.
   *
   * Existe porque la compuerta del onboarding los exige y antes no había dónde ponerlos después del
   * alta: el operador recibía el 409 con la lista y tenía que volver a crear la cuenta. Sólo escribe
   * lo que llega; lo demás se conserva. Se audita como cualquier cambio de la cuenta.
   */
  async setAccountDossier(
    accountId: string,
    input: SetAccountDossierDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'setAccountDossier',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });
      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      const { city, address, ...dossier } = input;
      const cambios: Record<string, unknown> = {
        ...camposDelExpediente(dossier, true),
        ...(city !== undefined ? { city } : {}),
        ...(address !== undefined ? { address } : {}),
      };
      const oldValues = Object.fromEntries(
        Object.keys(cambios).map((key) => [
          key,
          (account as unknown as Record<string, unknown>)[key],
        ]),
      );
      account.set(cambios);
      await account.save({ transaction });
      await account.reload({ include: [this.repository.accountTags], transaction });

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: 'UPDATE',
          changedByUserId: user.sub,
          oldValues,
          newValues: toAccountResponse(account),
        },
        transaction,
      );
      return toAccountResponse(account);
    });
  }

  async restoreAccount(accountId: string, user: AuthUser): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'restoreAccount',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      if (!account.archivedAt) {
        throw new ConflictException('La cuenta no está archivada.');
      }

      account.archivedAt = null;
      await account.save({ transaction });
      await account.reload({ include: [this.repository.accountTags], transaction });

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: 'RESTORE',
          changedByUserId: user.sub,
          newValues: toAccountResponse(account),
        },
        transaction,
      );

      return toAccountResponse(account);
    });
  }

  async createContact(
    accountId: string,
    input: CreateContactDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'createContact',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }

      if (input.isPrimary) {
        await this.repository.contacts.update(
          { isPrimary: false },
          { where: { accountId, isPrimary: true }, transaction },
        );
      }

      const contact = await this.repository.contacts.create(
        {
          accountId,
          fullName: input.fullName,
          roleTitle: input.roleTitle ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          decisionRole: input.decisionRole ?? null,
          isPrimary: input.isPrimary,
        },
        { transaction },
      );

      return toContactResponse(contact);
    });
  }

  async qualifyAccount(
    accountId: string,
    input: QualifyAccountDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BAccountsService.name, 'B2B CRM use case started', {
      useCase: 'qualifyAccount',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }

      const nextStatus = input.hasCommercialFit
        ? AccountLifecycleStatus.QUALIFIED
        : AccountLifecycleStatus.DISQUALIFIED;
      const clasificacion = input.hasCommercialFit ? input.classification : {};

      // Una cuenta calificada tiene que decir qué ofrece: es lo que el comercial lee antes de
      // abrir una oportunidad. Vale la que ya tuviera la cuenta.
      if (
        input.hasCommercialFit &&
        !clasificacion.businessDescription &&
        !account.businessDescription?.trim()
      ) {
        throw new BadRequestException(
          'Para calificar la cuenta describe qué ofrece el negocio (mínimo 10 caracteres).',
        );
      }

      await account.update(
        {
          ...(clasificacion.industry !== undefined && { industry: clasificacion.industry }),
          ...(clasificacion.category !== undefined && { category: clasificacion.category }),
          ...(clasificacion.businessLine !== undefined && {
            businessLine: clasificacion.businessLine,
          }),
          ...(clasificacion.businessDescription !== undefined && {
            businessDescription: clasificacion.businessDescription,
          }),
          ...(clasificacion.websiteUrl !== undefined && { websiteUrl: clasificacion.websiteUrl }),
          ...(clasificacion.employeeCount !== undefined && {
            employeeCount: clasificacion.employeeCount,
          }),
          ...(clasificacion.annualRevenue !== undefined && {
            annualRevenue: clasificacion.annualRevenue.toFixed(2),
          }),
          ...(clasificacion.expectedMonthlyVolume !== undefined && {
            expectedMonthlyVolume: clasificacion.expectedMonthlyVolume.toFixed(2),
          }),
          ...(clasificacion.riskTier !== undefined && { riskTier: clasificacion.riskTier }),
          lifecycleStatus: nextStatus,
          notes: input.hasCommercialFit
            ? account.notes
            : (input.disqualificationReason ?? account.notes),
          updatedAt: new Date(),
        },
        { transaction },
      );

      let opportunity: Record<string, unknown> | null = null;

      if (input.hasCommercialFit && input.createOpportunity) {
        if (!input.opportunity) {
          throw new BadRequestException(
            'Debe enviar datos de oportunidad cuando createOpportunity=true.',
          );
        }

        const created = await this.repository.opportunities.create(
          {
            accountId,
            ownerUserId: user.sub,
            name: input.opportunity.name,
            opportunityType: input.opportunity.opportunityType,
            stage: OpportunityStage.DISCOVERY,
            expectedMonthlyVolume: input.opportunity.expectedMonthlyVolume?.toFixed(2) ?? null,
            expectedMdrRate: input.opportunity.expectedMdrRate?.toFixed(6) ?? null,
            expectedMonthlyRevenue: this.calculateExpectedRevenue(
              input.opportunity.expectedMonthlyVolume,
              input.opportunity.expectedMdrRate,
            ),
            probability: input.opportunity.probability.toFixed(2),
            expectedCloseDate: input.opportunity.expectedCloseDate ?? null,
          },
          { transaction },
        );
        opportunity = toOpportunityResponse(created);
      }

      await this.repository.audit(
        {
          entityName: 'b2b_accounts',
          entityId: account.id,
          action: input.hasCommercialFit ? 'QUALIFY' : 'DISQUALIFY',
          changedByUserId: user.sub,
          newValues: { lifecycleStatus: nextStatus, classification: clasificacion, opportunity },
        },
        transaction,
      );

      return { account: toAccountResponse(account), opportunity };
    });
  }
}

/**
 * Los campos del expediente tal como van a la fila. Con `soloLosQueLlegan` no se pisan con null los
 * que no vinieron (corrección parcial); sin él, el alta escribe null donde no se capturó.
 */
function camposDelExpediente(
  dossier: CreateAccountDto['dossier'] | undefined,
  soloLosQueLlegan = false,
): Record<string, unknown> {
  const claves = [
    'commercialRegistry',
    'legalRepFullName',
    'legalRepDocumentType',
    'legalRepDocumentNumber',
    'powerOfAttorneyFileId',
    'bankQrFileId',
    'bankInstitutionCode',
    'bankAccountMasked',
  ] as const;
  const fila: Record<string, unknown> = {};
  for (const clave of claves) {
    const valor = dossier?.[clave];
    if (valor !== undefined) fila[clave] = valor;
    else if (!soloLosQueLlegan) fila[clave] = null;
  }
  return fila;
}
