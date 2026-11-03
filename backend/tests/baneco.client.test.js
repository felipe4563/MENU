const { createDecipheriv } = require('crypto');
const { cifrar } = require('../src/integrations/baneco/baneco.client');

const LLAVE = '40A318B299F245C2B697176723088629'; // la del ejemplo de la especificación v1.4.0

function descifrar(base64, llave) {
  const b = Buffer.from(base64, 'base64');
  const d = createDecipheriv('aes-256-cbc', Buffer.from(llave, 'utf8'), b.subarray(0, 16));
  return Buffer.concat([d.update(b.subarray(16)), d.final()]).toString('utf8');
}

describe('Banco Económico: cifrado AES', () => {
  it('usa el mismo formato que el banco (el ejemplo del documento se descifra a "1234")', () => {
    expect(descifrar('KJAzqjmwjxIOqVo5J3IH0/7fGmNdzuyszrlqexVSeos=', LLAVE)).toBe('1234');
  });

  it('lo que cifra se descifra con la misma llave, con IV distinto cada vez', () => {
    const a = cifrar('1012345678', LLAVE);
    const b = cifrar('1012345678', LLAVE);
    expect(a).not.toBe(b);
    expect(descifrar(a, LLAVE)).toBe('1012345678');
    expect(descifrar(b, LLAVE)).toBe('1012345678');
  });

  it('rechaza una llave que no tiene 32 caracteres', () => {
    expect(() => cifrar('1234', 'corta')).toThrow(/32 caracteres/);
  });
});
