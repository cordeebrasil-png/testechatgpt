# Decisão de integração do frete

Fonte oficial consultada: https://docs.ironpayapp.com.br/
Bundle público da documentação: https://docs.ironpayapp.com.br/assets/index-CZ6gGEP2.js
Consulta: 2026-10-21.

O schema de criação de transações documenta `amount`, `offer_hash`, `cart` (itens com `product_hash`, `title`, `price`, `quantity`, `operation_type`, `tangible`), `payment_method: pix` e `installments: 1`. Não localizamos um campo específico de frete ou upsell.

Implementação: calcular o preço combinado de produto e modalidade de entrega no servidor, usar esse preço em `amount` e `cart[0].price`, e identificar a modalidade no título do item. Nenhum novo produto/hash ou campo não documentado é inventado. O painel continua associando a transação ao produto previamente configurado. Não prometemos classificação separada de upsell ou contratação automática de transporte.

A validação automatizada cobre o contrato documentado com respostas simuladas, incluindo recusa de valores divergentes. Não houve criação de uma cobrança real nesta implementação; a configuração comercial da oferta não foi verificada com uma transação real.
