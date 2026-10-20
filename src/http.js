'use strict';
// Requisição HTTP mínima usando só o Node. Fica no processo principal,
// então não tem problema de CORS e dá pra aceitar certificado autoassinado
// (comum em servidores internos) quando o usuário pedir.

const http = require('node:http');
const https = require('node:https');

// Erros de rede em português, com a dica mais provável (o código original fica em err.code)
const NET_ERRORS = {
  ECONNREFUSED: (u) => `Conexão recusada em ${u.host} (o serviço está no ar nessa porta?)`,
  ENOTFOUND: (u) => `Não encontrei o host ${u.hostname} (DNS/VPN?)`,
  EAI_AGAIN: (u) => `Não consegui resolver ${u.hostname} agora (DNS/VPN?)`,
  ETIMEDOUT: (u) => `${u.host} não respondeu a tempo (rede, VPN ou firewall?)`,
  ECONNRESET: (u) => `A conexão com ${u.host} caiu no meio do caminho`,
  EHOSTUNREACH: (u) => `Sem rota até ${u.host} (rede ou VPN?)`,
  ENETUNREACH: () => 'Sem rede no momento',
  CERT_HAS_EXPIRED: (u) => `O certificado de ${u.host} venceu`,
  ERR_TLS_CERT_ALTNAME_INVALID: (u) => `O certificado não é de ${u.hostname} (o endereço está certo?)`,
};
const SELF_SIGNED = ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'];

function friendly(err, u) {
  let message = null;
  if (SELF_SIGNED.includes(err.code)) {
    message = `Certificado não confiável em ${u.host}. Se for um servidor interno, marque "aceitar certificado autoassinado".`;
  } else if (NET_ERRORS[err.code]) {
    message = NET_ERRORS[err.code](u);
  }
  if (!message) return err;
  const out = new Error(message);
  out.code = err.code;
  return out;
}

function request(url, { method = 'GET', headers = {}, body, insecure = false, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      reject(new Error(`URL inválida: ${url}`));
      return;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      reject(new Error(`Protocolo não suportado: ${u.protocol}`));
      return;
    }

    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const finalHeaders = { Accept: 'application/json', ...headers };
    if (payload !== undefined) {
      finalHeaders['Content-Type'] = 'application/json';
      finalHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = lib.request(
      u,
      { method, headers: finalHeaders, rejectUnauthorized: !insecure, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = undefined; // não era JSON
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error(`Tempo esgotado (${timeoutMs / 1000}s) falando com ${u.host}`)));
    req.on('error', (err) => reject(friendly(err, u)));
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

module.exports = { request, friendly };
