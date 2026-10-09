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

## Integração Pix via IronPay

O checkout cria uma cobrança Pix pelo endpoint `/api/orders` e a tela `/pagamento/` consulta o status no servidor, exibe o código copia e cola e gera o QR Code. O navegador recebe apenas um identificador de pedido e um token temporário; o token da IronPay fica somente no ambiente do Cloudflare.

No Cloudflare Pages, em **Settings → Variables and secrets**, configure:

- `IRONPAY_API_TOKEN` como Secret.
- `IRONPAY_OFFER_HASH` com o hash da oferta.
- `IRONPAY_PRODUCT_HASH` com o hash do produto.

Em **Settings → Bindings**, adicione um banco D1 e use o nome `ORDERS_DB`. Execute o conteúdo de `migrations/0001_orders.sql` no console SQL do banco antes de testar o checkout. O webhook público usado pela integração é `/api/ironpay-webhook`; ele consulta a transação na IronPay e não confia no status recebido no corpo da notificação.

O valor é fixado no servidor em 11990 centavos (R$ 119,90), e o Pix segue o prazo informado pela IronPay (24 horas por padrão). O contador visual acompanha a data de expiração retornada pela API.

A consulta de CEP depende de disponibilidade das APIs externas. Em caso de falha, o endereço continua editável e uma nova tentativa pode ser solicitada.


Nenhuma chave de API está incluída no repositório. A documentação confirma `installments: 1` para Pix e autenticação da API via query parameter `api_token`.
