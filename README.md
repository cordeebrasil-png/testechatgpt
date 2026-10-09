# Maré Azul

Página de vendas e checkout demonstrativo.

## Rotas

- `/`: loja.
- `/checkout/`: checkout; recebe `?cor=Azul`, Preto, Verde ou Vermelho.
- `/obrigado/`: demonstração da página de obrigado.
- `/api/cep/88220000`: consulta de CEP pelas Pages Functions, com BrasilAPI e ViaCEP como fontes.

## Publicação no Cloudflare Pages

Conecte este repositório, selecione a branch `checkout-preview`, framework `None`, deixe o comando de build vazio e use `.` como diretório de saída, na raiz do repositório. A pasta `functions` precisa ser implantada pelo Cloudflare Pages. GitHub Pages sozinho não executa essas funções.

Depois do deploy, abra `/api/cep/88220000`: uma consulta bem-sucedida deve retornar JSON com localidade e UF. Teste também o CEP no checkout. Um push ao GitHub só publica o site se houver integração configurada no Cloudflare.

## Limitações

O checkout não cria pedidos, não envia os dados pessoais e não gera Pix. O botão final abre `/pagamento/`, ainda demonstrativa. A página de obrigado não confirma pagamento. Nenhuma chave de API está incluída.

A consulta de CEP depende de disponibilidade das APIs externas. Em caso de falha, o endereço continua editável e uma nova tentativa pode ser solicitada.


## Integração IronPay em preparação

`functions/_lib/ironpay.js` monta o payload da cobrança Pix no servidor, com validação dos dados e valor fixo de 11990 centavos. Não realiza chamadas nem cria cobranças por enquanto.

Configure os identificadores reais `IRONPAY_OFFER_HASH` e `IRONPAY_PRODUCT_HASH` no Cloudflare. O token deverá ser guardado como secret `IRONPAY_API_TOKEN`, nunca no HTML ou em arquivos versionados. O webhook depende da documentação de autenticação e confirmação; não configure uma URL não implementada.

Pendente: exemplo de resposta da criação Pix, consulta da transação, autenticação do webhook e confirmação do prazo de expiração. O campo documentado `expire_in_days` não permite inferir expiração de 30 minutos. A tela e o contador atuais continuam demonstrativos.
