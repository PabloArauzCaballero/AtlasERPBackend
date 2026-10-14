import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import {
  type CredentialsSnapshot,
  describeCredentials,
  summarizeCredentials,
} from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';

/** Lo que el ERP sabe de las credenciales de los usuarios de un comercio, para la lista y el detalle. */
@Injectable()
export class MerchantCredentialsReader {
  constructor(private readonly repository: B2BSalesCrmRepository) {}

  /** Los usuarios con petición de identidad, agrupados por cuenta. */
  async byAccount(
    accountIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, CredentialsSnapshot[]>> {
    const map = new Map<string, CredentialsSnapshot[]>();
    if (accountIds.length === 0) return map;
    const users = await this.repository.merchantUsers.findAll({
      where: { accountId: { [Op.in]: accountIds } },
      attributes: ['accountId', 'status', 'identityRequestId', 'userId', 'identityRejectionReason'],
      ...(transaction ? { transaction } : {}),
    });
    for (const user of users) {
      const list = map.get(user.accountId) ?? [];
      list.push({
        status: user.status,
        identityRequestId: user.identityRequestId,
        userId: user.userId,
        rejectionReason: user.identityRejectionReason,
      });
      map.set(user.accountId, list);
    }
    return map;
  }

  describe(users: ReadonlyArray<CredentialsSnapshot>): Record<string, unknown> {
    const credentials = summarizeCredentials(users);
    return { credentials, credentialsSummary: describeCredentials(credentials) };
  }
}
