# Maré Azul

Página de vendas e checkout Pix com integração IronPay via Cloudflare Pages Functions.

## Rotas

- `/`: loja.
- `/checkout/`: checkout; recebe `?cor=Azul`, Preto, Verde ou Vermelho.
- `/pagamento/`: consulta o pedido autenticado, exibe apenas o código recebido da API e gera o QR Code.
- `/obrigado/`: mostra a confirmação e os dados do pedido após verificar o status pago no servidor.
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

O valor é fixado no servidor em 11990 centavos (R$ 119,90), e o Pix segue o prazo informado pela IronPay (24 horas por padrão). O contador visual sugere pagamento em 30 minutos, vinculado ao pedido e persistente ao recarregar. O fim desse contador não declara que uma cobrança ainda válida no provedor expirou.

## Desenvolvimento e verificação

Use Node.js 22 ou mais recente. Execute `npm ci` e `npm run build` após editar `assets/*-source.js`. O build gera os blocos inline identificados por comentários nas páginas; não os edite manualmente. Os HTMLs gerados são versionados, portanto o Pages pode continuar com comando de build vazio.

`npm test` executa testes de backend com SQLite em memória. `npm run test:browser` testa o fluxo em Chromium com todas as chamadas interceptadas: não cria cobranças reais. O teste usa `/usr/bin/chromium` quando disponível; em outro ambiente instale-o com `npx playwright install chromium`.

## Diagnóstico de pagamento

A tela mantém o visual do pagamento e só exibe o código recebido da IronPay. O checkout consulta a tentativa em andamento e só navega para o pagamento quando há um Pix disponível (ou pagamento confirmado). Diagnósticos técnicos não são exibidos ao cliente. A sessão é salva antes da criação, e novas tentativas após falha de conexão reutilizam o mesmo ID para evitar duplicidade. Um pedido incerto sem identificador da IronPay exige conciliação no provedor antes de gerar outra cobrança.

`GET /api/payment-health` verifica apenas a existência da tabela e a consulta autenticada do produto na IronPay, sem criar transações, expor credenciais ou retornar dados da conta. A resposta fica em cache por 60 segundos. Um resultado positivo não comprova criação/liquidação de Pix.

No console do navegador, `window.__mareAzulPixDiagnostics` contém somente versão, status e códigos seguros para suporte (não inclui token, Pix ou dados pessoais). Em Functions logs, eventos `payment_failure` registram apenas a operação, código fixo e status HTTP do provedor. Exemplos: `PAYMENT_CONFIGURATION_MISSING`, `DATABASE_SCHEMA_MISSING`, `PROVIDER_AUTH_FAILED`, `PROVIDER_RESPONSE_INVALID`.

Os testes locais não substituem a validação com o D1 e as credenciais da produção. Não envie tokens nem dados pessoais em capturas do painel.

A consulta de CEP depende de disponibilidade das APIs externas. Em caso de falha, o endereço continua editável e uma nova tentativa pode ser solicitada.


Nenhuma chave de API está incluída no repositório. A documentação confirma `installments: 1` para Pix e autenticação da API via query parameter `api_token`.

## Pixel TikTok

Pixel público: `DA5U5MRC77U8NT7JF3A0`. Fonte: `assets/tiktok-source.js`, incluída nos bundles gerados por `npm run build`.

- Somente o hostname de produção `mare-azul.pages.dev` carrega o pixel. Prévia, localhost e rotas de testes não carregam. Ao adotar um domínio próprio, atualizar a lista de hosts e validar novamente.
- `PageView` via `ttq.page()` nas páginas do funil; `ViewContent` na página de vendas; `InitiateCheckout` na entrada do checkout.
- `Purchase` somente em `/obrigado/`, depois da consulta autenticada confirmar `paid`. Valor vem de `amount` do servidor, convertido de centavos para BRL. Gerar/copiar Pix e parâmetros da URL não confirmam compra.
- Identificação de evento estável por pedido; proteção contra repetição no mesmo navegador com `localStorage`. Não promete deduplicação entre dispositivos. Nenhum dado de formulário, CPF, token ou recibo é incluído nas propriedades que o código envia ao pixel.
- Falha/bloqueio do SDK não interfere no checkout e não marca a compra como enviada. O marcador local indica chamada ao SDK, não confirmação de recebimento pelo TikTok.
- Implementação por navegador, sem Events API: fechar a página antes da confirmação ou bloquear o pixel pode impedir o evento de compra. Não configurar conversões de compra pelo clique no botão Pix no Event Builder.

Validar no TikTok Events Manager em Testar eventos e no Pixel Helper, usando o domínio de produção. Os testes automatizados interceptam o SDK e as respostas de pagamento; não enviam conversões reais ao TikTok. A entrega ao painel deve ser confirmada separadamente. A oferta isolada de R$ 1 ainda depende da criação e do hash da oferta de teste na IronPay; o preço de produção permanece R$ 119,90.
