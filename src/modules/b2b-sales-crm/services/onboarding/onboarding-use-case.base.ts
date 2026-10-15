import { B2BSalesCrmUseCaseBase } from '../b2b-sales-crm-use-case.base';

/** Base de los casos de uso del alta de comercios: deja constancia de que el caso de uso arrancó. */
export abstract class OnboardingUseCase extends B2BSalesCrmUseCaseBase {
  protected announce(useCase: string): void {
    this.logger.infoContext(this.constructor.name, 'B2B CRM use case started', { useCase });
  }
}
