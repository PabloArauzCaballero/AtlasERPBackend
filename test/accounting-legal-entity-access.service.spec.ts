import { ForbiddenException } from '@nestjs/common';
import { LegalEntityAccessService } from '../src/common/services/legal-entity-access.service';

describe('LegalEntityAccessService', () => {
  const service = new LegalEntityAccessService();

  it('permite acceso global a admin sin depender de mayúsculas/minúsculas', () => {
    expect(() =>
      service.assertCanAccessLegalEntity(
        { sub: 'u1', role: 'ADMIN' },
        '00000000-0000-4000-8000-000000000001',
      ),
    ).not.toThrow();
  });

  it('permite acceso cuando la entidad legal está en el token', () => {
    expect(() =>
      service.assertCanAccessLegalEntity(
        { sub: 'u1', role: 'accountant', legalEntityIds: ['00000000-0000-4000-8000-000000000001'] },
        '00000000-0000-4000-8000-000000000001',
      ),
    ).not.toThrow();
  });

  it('rechaza roles no admin sin alcance por entidad legal', () => {
    expect(() =>
      service.assertCanAccessLegalEntity(
        { sub: 'u1', role: 'accountant' },
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toThrow(ForbiddenException);
  });

  it('rechaza roles no admin sin la entidad solicitada', () => {
    expect(() =>
      service.assertCanAccessLegalEntity(
        { sub: 'u1', role: 'accountant', legalEntityIds: ['00000000-0000-4000-8000-000000000001'] },
        '00000000-0000-4000-8000-000000000002',
      ),
    ).toThrow(ForbiddenException);
  });
});
