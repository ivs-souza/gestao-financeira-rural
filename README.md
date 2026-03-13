# 🚜 LidAgro - Gestão Rural Inteligente
O braço direito do produtor na palma da mão.

O **LidAgro** evoluiu de uma planilha digital para um ecossistema de gestão modular. Nossa visão é transformar a complexidade da lida do campo em dados claros, permitindo que o produtor tome decisões baseadas em lucros reais e saúde do rebanho, tudo diretamente do MacBook ou na palma da mão via mobile.

## 🛠️ Tecnologias e Stack
- **Frontend**: React.js / Vite (Estrutura Modular)
- **Estilização**: Tailwind CSS / Vanilla CSS Premium
- **Backend/Database**: Firebase (Auth, Firestore, Storage)
- **Persistência**: Offline-First com sincronização local
- **Geo**: Integração API IBGE para regionalização de dados

---

## 🚀 Funcionalidades (v2.1)

### 📋 Módulo Rebanho (Leite & Corte)
- **Busca em Tempo Real**: Localize animais instantaneamente pelo brinco ou nome.
- **Filtros Rápidos (Chips)**: Segmentação ágil por Categoria (Fêmea, Macho, Bezerro) e Estado Produtivo (Secas, Lactação).
- **Gestão Reprodutiva**: Controle de data de parto e inseminação com interface intuitiva.
- **Manejo Mobile**: Interface otimizada para uso com uma mão durante a lida.

### 💰 Gestão Financeira Inteligente
- **Placeholders Explicativos**: Textos de exemplo refinados (ex: "Compra de Ração", "Venda de Bezerros") para orientar o registro correto.
- **Dashboard Consolidado**: Visão global e segmentada por atividade (Leite + Corte).
- **Filtros de Período**: Visualização por Mês, Trimestre, Ano ou histórico total.

### 🔐 Segurança e UX Premium
- **Acessibilidade**: Recurso de alternância de visibilidade (`Eye Toggle`) na senha.
- **Dark Mode**: Ajustes finos de contraste em botões e formulários (fundo grafite #1A1A1A).
- **Floating Action Button (FAB)**: Menu expansivo com micro-animações para ações rápidas.
- **Safe Area (PWA/iOS)**: Ajustes de layout para evitar obstruções por barras do sistema.

### ⚙️ Estabilidade Técnica
- **Renderização Condicional**: Modais geridos via Registry, removidos fisicamente do DOM quando fechados.
- **Sincronização**: Fluxo robusto entre Firebase e LocalStorage para uso offline.
- **Scroll Fix**: Resolução definitiva de conflitos de rolagem em dispositivos iPhone/Safari.

---

## 📈 Roadmap & Próximos Passos
- [ ] **Relatórios PDF**: Exportação de extratos profissionais diretamente para contabilidade.
- [ ] **Gestão de Estoque**: Controle de ração, vacinas e insumos.
- [ ] **Alertas de Mercado**: Notificações baseadas em variações de preço da B3.
- [ ] **Simulador de Lucro**: Projeções baseadas em ganho de peso e preço da arroba.

---

## 💻 Instruções para Desenvolvedores

### Setup Local
1. Clone o repositório:
   `git clone https://github.com/ivs-souza/gestao-financeira-rural.git`
2. Instale as dependências:
   `npm install`
3. Execute o ambiente de desenvolvimento:
   `npm start` ou `npm run dev`
4. Abra o `index.html` ou o endereço do servidor local no navegador.

### Fluxo de Trabalho (Push)
Sempre utilize o comando de push customizado para manter a sincronização com o MacBook:
`gpush`

**Caminho do Projeto no Sistema:**
`/Users/ivessouza/Desktop/LidAgro/rural-finance-app/`

---
*Gerado via MacBook Air de Ives - Documentação Consolidada em 12 de Março de 2026*

---

*Gerado via MacBook Air de Ives - Atualizado em 12 de Março de 2026*