import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { AccountLifecycleStatus, BranchStatus, ChecklistStatus } from '../b2b-sales-crm.enums';
import type {
  CompleteChecklistItemDto,
  CreateBranchDto,
  CreateMerchantUserDto,
  CreateOnboardingCaseDto,
} from '../b2b-sales-crm.dtos';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

@Injectable()
export class B2BOnboardingService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async createOnboardingCase(input: CreateOnboardingCaseDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createOnboardingCase',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(input.accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }

      const existingOpenCase = await this.repository.onboardingCases.findOne({
        where: {
          accountId: input.accountId,
          status: { [Op.in]: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
        },
        transaction,
      });

      if (existingOpenCase) {
        throw new ConflictException('La cuenta ya tiene un caso de onboarding abierto.');
      }

      const caseRecord = await this.repository.onboardingCases.create(
        {
          accountId: input.accountId,
          ownerUserId: input.ownerUserId,
          status: 'OPEN',
        },
        { transaction },
      );

      for (const item of input.checklistItems) {
        await this.repository.checklistItems.create(
          {
            onboardingCaseId: caseRecord.id,
            itemType: item.itemType,
            description: item.description,
            status: ChecklistStatus.PENDING,
          },
          { transaction },
        );
      }

      return this.getOnboardingCase(caseRecord.id, transaction);
    });
  }

  async getOnboardingCase(id: string, transaction?: Transaction): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'getOnboardingCase',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(
      id,
      transaction
        ? { include: [this.repository.checklistItems], transaction }
        : { include: [this.repository.checklistItems] },
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
      checklistItems: caseRecord.checklistItems?.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        status: item.status,
        completedByUserId: item.completedByUserId,
      })),
    };
  }

  async createBranch(input: CreateBranchDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createBranch',
    });
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    const branch = await this.repository.branches.create({
      accountId: input.accountId,
      name: input.name,
      city: input.city ?? null,
      address: input.address ?? null,
      status: BranchStatus.PENDING,
      canOriginateBnpl: false,
    });

    return {
      id: branch.id,
      accountId: branch.accountId,
      name: branch.name,
      status: branch.status,
      canOriginateBnpl: branch.canOriginateBnpl,
    };
  }

  async createMerchantUser(input: CreateMerchantUserDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createMerchantUser',
    });
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    if (input.branchId) {
      const branch = await this.repository.branches.findOne({
        where: { id: input.branchId, accountId: input.accountId },
      });

      if (!branch) {
        throw new NotFoundException('Sucursal no encontrada para la cuenta indicada.');
      }
    }

    const existingUser = await this.repository.merchantUsers.findOne({
      where: { accountId: input.accountId, email: input.email },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario comercio con ese email en la cuenta.');
    }

    const user = await this.repository.merchantUsers.create({
      accountId: input.accountId,
      branchId: input.branchId ?? null,
      email: input.email,
      fullName: input.fullName,
      roleCode: input.roleCode,
      status: 'ACTIVE',
    });

    return {
      id: user.id,
      accountId: user.accountId,
      branchId: user.branchId,
      email: user.email,
      fullName: user.fullName,
      roleCode: user.roleCode,
      status: user.status,
    };
  }

  async completeChecklistItem(
    onboardingCaseId: string,
    input: CompleteChecklistItemDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'completeChecklistItem',
    });
    const item = await this.repository.checklistItems.findOne({
      where: { id: input.checklistItemId, onboardingCaseId },
    });

    if (!item) {
      throw new NotFoundException('Ítem de checklist no encontrado.');
    }

    await item.update({ status: input.status, completedByUserId: user.sub });
    return this.getOnboardingCase(onboardingCaseId);
  }

  async activateOnboardingCase(onboardingCaseId: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'activateOnboardingCase',
    });
    return this.repository.transaction(async (transaction) => {
      const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, {
        include: [this.repository.checklistItems],
        transaction,
      });

      if (!caseRecord) {
        throw new NotFoundException('Caso de onboarding no encontrado.');
      }

      const items = caseRecord.checklistItems ?? [];
      if (
        items.length === 0 ||
        items.some(
          (item) =>
            item.status !== ChecklistStatus.COMPLETED && item.status !== ChecklistStatus.WAIVED,
        )
      ) {
        throw new ConflictException(
          'No se puede activar comercio con checklist pendiente o bloqueado.',
        );
      }

      const activeVersion = await this.repository.findActiveContractVersion(
        caseRecord.accountId,
        new Date().toISOString().slice(0, 10),
        transaction,
      );

      if (!activeVersion) {
        throw new ConflictException('No se puede activar comercio sin contrato activo.');
      }

      await caseRecord.update({ status: 'COMPLETED', completedAt: new Date() }, { transaction });
      await this.repository.accounts.update(
        { lifecycleStatus: AccountLifecycleStatus.CUSTOMER, updatedAt: new Date() },
        { where: { id: caseRecord.accountId }, transaction },
      );
      await this.repository.branches.update(
        { status: BranchStatus.ACTIVE, canOriginateBnpl: true, activatedAt: new Date() },
        { where: { accountId: caseRecord.accountId, status: BranchStatus.PENDING }, transaction },
      );

      return this.getOnboardingCase(caseRecord.id, transaction);
    });
  }
}
