import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InternalUserModel } from '../b2b-sales-crm/models/b2b-sales-crm.models';

/**
 * Traduce a la persona que autenticó AtlasBackend en SU fila de `atlas_sales.internal_users`.
 *
 * Atlas parte la identidad a propósito: quién es la persona y cómo inicia sesión vive en
 * AtlasBackend, que emite identificadores opacos (bigints: `"1"`, `"27"`); qué puede tocar aquí
 * responde `atlas_sales.internal_users`, cuya clave es un `uuid` y a la que apuntan
 * `owner_user_id`, `created_by_user_id`, `completed_by_user_id`… de todo el CRM.
 *
 * Hasta el 2026-09-14 el token del ERP llevaba el id de Atlas en `sub` y 89 escrituras lo
 * guardaban tal cual: crear una cuenta B2B, una oportunidad o una propuesta moría en un 500
 * «invalid input syntax for type uuid: "1"» que la pantalla traducía a «Ocurrió un error al
 * consultar o modificar la base de datos». Se resolvía a mano en UN punto (completar un requisito
 * de onboarding) y en ningún otro. Ahora se resuelve UNA vez, al emitir la sesión: `sub` es el
 * uuid de esta base y el id de Atlas viaja aparte como `atlasUserId`.
 *
 * Se resuelve por correo, que es lo único que ambas bases comparten. Si la persona autentica
 * contra AtlasBackend y aún no tiene reflejo aquí, se crea: un analista recién dado de alta
 * arriba no puede quedarse sin poder trabajar abajo.
 */
@Injectable()
export class InternalUserMirrorService {
  constructor(
    @InjectModel(InternalUserModel)
    private readonly internalUsers: typeof InternalUserModel,
  ) {}

  async resolveId(input: {
    email: string;
    fullName?: string | null;
    roleCode: string;
  }): Promise<string> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.internalUsers.findOne({ where: { email } });
    if (existing) return existing.id;

    const created = await this.internalUsers.create({
      email,
      fullName: input.fullName?.trim() || email,
      roleCode: input.roleCode,
      isActive: true,
    });
    return created.id;
  }
}
