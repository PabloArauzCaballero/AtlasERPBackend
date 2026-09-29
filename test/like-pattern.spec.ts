import { containsPattern, escapeLikeLiteral } from '../src/common/persistence/sql/like-pattern';

describe('Patrón ILIKE «contiene» con comodines escapados', () => {
  it('escapa %, _ y la propia barra; el resto queda igual', () => {
    expect(escapeLikeLiteral('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(escapeLikeLiteral('Restaurantes')).toBe('Restaurantes');
  });

  it('envuelve el valor escapado en % para «contiene»', () => {
    expect(containsPattern('café_bar')).toBe('%café\\_bar%');
  });
});
