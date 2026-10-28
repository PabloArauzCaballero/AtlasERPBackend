import { BadRequestException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AtlasPartnerClient, assertPathStaysInsideUpstream } from './atlas-partner.client';

/**
 * Auditoría de seguridad 2026-10-28: `encodeURIComponent('..')` devuelve `..`, así que un
 * identificador de ruta `..` cruzaba las plantillas del gateway y, al normalizarse la URL, apuntaba
 * a otro recurso de AtlasBackend. El HttpService es un DOBLE declarado: aquí se prueba qué ruta
 * sale, no el comportamiento de AtlasBackend.
 */
function clientWithDouble() {
  const http = { request: jest.fn().mockReturnValue(of({ data: { data: { ok: true } } })) };
  return { http, client: new AtlasPartnerClient(http as unknown as HttpService) };
}

describe('AtlasPartnerClient · la ruta reenviada no sale de su prefijo', () => {
  describe('correcto', () => {
    it.each([
      'partner-onboarding/123/status',
      `partner-onboarding/${encodeURIComponent('a b')}/branches`,
      'operations/erp-documents/content?storageKey=a%2Fb%2Fc',
      'merchant/support/knowledge/search?q=..%2F..',
    ])('deja pasar %s', (path) => {
      expect(() => assertPathStaysInsideUpstream(path)).not.toThrow();
    });

    it('reenvía con el token del actor y el tenant configurado', async () => {
      const { http, client } = clientWithDouble();
      await expect(
        client.forward({ method: 'GET', path: 'partner-onboarding/7/status', accessToken: 'tok' }),
      ).resolves.toEqual({ ok: true });
      expect(http.request).toHaveBeenCalledTimes(1);
      expect(http.request.mock.calls[0][0].headers.Authorization).toBe('Bearer tok');
    });
  });

  describe('límite', () => {
    it.each([
      ['punto simple', 'partner-onboarding/./status'],
      ['punto doble', 'partner-onboarding/../status'],
      ['punto doble al final', 'partner-onboarding/..'],
      ['punto doble codificado', 'partner-onboarding/%2e%2e/status'],
      ['punto doble en mayúsculas codificado', 'partner-onboarding/%2E%2E/status'],
      ['barra codificada', 'partner-onboarding/a%2Fb/status'],
      ['barra invertida', 'partner-onboarding/a%5Cb/status'],
      ['barra invertida literal', 'partner-onboarding/a\\b/status'],
    ])('rechaza %s', (_nombre, path) => {
      expect(() => assertPathStaysInsideUpstream(path)).toThrow(BadRequestException);
    });
  });

  describe('inválido', () => {
    it('forward rechaza `..` y no llama a AtlasBackend', async () => {
      const { http, client } = clientWithDouble();
      await expect(
        client.forward({
          method: 'GET',
          path: `partner-onboarding/${encodeURIComponent('..')}/status`,
          accessToken: 'tok',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(http.request).not.toHaveBeenCalled();
    });

    it('forwardBinary rechaza `..` y no llama a AtlasBackend', async () => {
      const { http, client } = clientWithDouble();
      await expect(
        client.forwardBinary({
          method: 'GET',
          path: `partner-onboarding/${encodeURIComponent('..')}/qr-codes/1/content`,
          accessToken: 'tok',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(http.request).not.toHaveBeenCalled();
    });

    it('un percent-encoding malformado se rechaza, no revienta', () => {
      expect(() => assertPathStaysInsideUpstream('partner-onboarding/%E0%A4%A/status')).toThrow(
        BadRequestException,
      );
    });
  });
});
