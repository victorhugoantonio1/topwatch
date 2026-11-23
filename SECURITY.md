# Política de segurança

## Versões com suporte

Só a versão mais recente (a última [release](https://github.com/victorhugoantonio1/topwatch/releases/latest)) recebe correções de segurança. Se você usa uma versão antiga, confira se o problema continua na mais nova antes de reportar.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Uma falha descrita em público fica exposta antes de existir correção.

Use o reporte privado do GitHub:

1. Na aba **Security** deste repositório, clique em **Report a vulnerability** (ou acesse direto [este link](https://github.com/victorhugoantonio1/topwatch/security/advisories/new)).
2. Descreva o problema, a versão afetada e, se possível, os passos para reproduzir.

O relato fica visível só para o mantenedor.

## O que esperar

- O TopWatch é mantido por uma pessoa só. A ideia é dar uma primeira resposta em até 7 dias.
- Confirmada a falha, a correção sai numa nova versão, junto com um aviso de segurança (security advisory) neste repositório. Quem reportou recebe o crédito, se quiser.

## Escopo

Interessa principalmente:

- exposição ou vazamento de tokens do Zabbix;
- fuga do isolamento da interface (`contextIsolation`, `sandbox`, CSP);
- execução de código ou HTML a partir de dados vindos do Zabbix ou de plugins;
- abertura de links que não sejam `http`/`https`.

Fora do escopo:

- plugins de terceiros, que rodam com acesso ao computador por definição (veja a seção Segurança do README);
- o aviso do SmartScreen por o instalador não ser assinado, que já está documentado.
