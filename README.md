# Luciana & Luciano — apresentação editorial R18

Site estático para GitHub Pages. A página inicial é index.html. O visualizador original foi preservado em cena.html e é carregado somente ao abrir o projeto 3D. A geometria binária e seus materiais permanecem intactos.

## Atualização de conteúdo

- catalogo.json: projeto, ambientes, elementos, produtos, associação de roots do modelo às fichas e páginas do PDF. IDs devem permanecer estáveis.
- products: preencha dimensions, quantity, materials, finish, brand, model e url somente com dados confirmados. Campos nulos aparecem como especificação pendente. roots contém apenas objetos identificados no modelo.
- elements: pages usa a posição da página no PDF, iniciando em 1, e não o número impresso no rodapé. Essa distinção é necessária para a R02 fornecida.
- renders: src é a prévia leve, full preserva o PNG original; room controla o filtro por ambiente.
- app.css e app.js: apresentação, navegação e fichas.
- documents.js: visualização PDF.js, navegação, impressão e download do original.
- interface-01.js: motor original com uma ponte de mensagens de mesma origem para a nova apresentação. Preservar coordenadas, materiais, offsets e geometria-*.bin.

## Documento original

O PDF original tem 120.820.687 bytes, acima do limite de arquivo individual do GitHub. assets/pdf/original-*.bin são segmentos contíguos de 4 MiB; não são PDFs separados nem versões redesenhadas. O leitor busca os blocos sob demanda. O download recompõe os bytes originais e confere o SHA-256 registrado no catálogo. Miniaturas são apenas prévias de navegação. A impressão usa páginas renderizadas do original em A4 paisagem; para melhor resultado técnico é possível baixar o PDF original e imprimir em 100%.

## Comportamentos

Links diretos usam fragmentos (#elemento/hall, #produto/banqueta, #pranchas/21, #imagem/4), compatíveis com GitHub Pages. Produtos incorporados em conjuntos não recebem geometrias inventadas. A camada de forro usa o único grupo original classificado como forro; sua geometria não foi subdividida. Os modos semitransparente, isolado e técnico alteram apenas apresentação e visibilidade. O conjunto suspenso continua uma peça independente.

A ação de explosão foi retirada. O caminho público de documentação utiliza exclusivamente o PDF R02. Rotinas antigas de geração de pranchas permanecem isoladas no arquivo histórico do motor, inacessíveis pela nova navegação, para evitar uma refatoração destrutiva dos wrappers existentes.

## Referências pendentes

- Geladeira: capacidade diverge entre texto e endereço fornecido.
- Piso York: formato diverge entre texto e endereço fornecido.
- Tapetes: associação de cada referência ao objeto/ambiente ainda não confirmada.
- Produtos sem ficha comercial confirmada mantêm pendências explícitas.
- Forro agrupado: não permite seleção de sancas/cortineiros individuais sem revisão do modelo.

Biblioteca PDF.js 5.6.205 incluída localmente sob Apache-2.0 (assets/vendor/LICENSE-pdfjs.txt).

Conferências de integridade e sintaxe realizadas na entrega. Avaliação visual e testes de uso em navegador ficam para o usuário, conforme solicitado.
