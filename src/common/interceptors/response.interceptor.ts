import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { success: true; data: T }> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ success: true; data: T }> {
    return next.handle().pipe(
      map((data) => {
        /*
         * Un `StreamableFile` NO se envuelve: son bytes que se transmiten tal cual —una imagen de QR,
         * un comprobante—. Envolverlo en `{ success, data }` lo serializa a JSON (el objeto stream
         * entero, con su buffer convertido en `{type:'Buffer',data:[...]}`) y lo manda con
         * `Content-Type: image/png`: el navegador recibe JSON disfrazado de imagen y pinta un roto.
         * Este era el motivo de que el QR y el comprobante no se vieran aunque el endpoint respondía
         * 200.
         */
        if (data instanceof StreamableFile) {
          return data as unknown as { success: true; data: T };
        }

        if (data && typeof data === 'object' && 'success' in data) {
          return data as unknown as { success: true; data: T };
        }

        return { success: true, data };
      }),
    );
  }
}
