import './style.css'
import { api, applySettings } from './api.js'

// Aplicar configurações personalizadas
applySettings();

// Exemplo de como usar a nova API
document.querySelector('#app').innerHTML = `
  <div>
    <h1 class="site-title">Sistema de Rifas</h1>
    <div class="card">
      <p>Sistema funcionando com nova API local!</p>
      <p>Acesse <a href="/admin.html" target="_blank">o painel administrativo</a> para gerenciar rifas.</p>
      <p><strong>Login padrão:</strong></p>
      <p>Email: admin@rifas.com</p>
      <p>Senha: admin123</p>
    </div>
    <div id="rifas-list"></div>
  </div>
`

// Carregar e exibir rifas
async function loadRifas() {
  try {
    const rifas = await api.getRifas();
    const rifasList = document.getElementById('rifas-list');
    
    if (rifas.length === 0) {
      rifasList.innerHTML = '<p>Nenhuma rifa disponível no momento.</p>';
      return;
    }
    
    rifasList.innerHTML = `
      <h2>Rifas Disponíveis</h2>
      <div class="rifas-grid">
        ${rifas.map(rifa => `
          <div class="rifa-card">
            ${rifa.image_url ? `<img src="http://localhost:3001${rifa.image_url}" alt="${rifa.title}">` : ''}
            <h3>${rifa.title}</h3>
            <p>${rifa.description || ''}</p>
            <p class="price">R$ ${rifa.price.toFixed(2)} por número</p>
            <p class="total">${rifa.total_numbers} números disponíveis</p>
            <button onclick="selectRifa(${rifa.id})">Participar</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Erro ao carregar rifas:', error);
    document.getElementById('rifas-list').innerHTML = '<p>Erro ao carregar rifas. Verifique se o servidor está rodando.</p>';
  }
}

// Função global para selecionar rifa
window.selectRifa = async (rifaId) => {
  try {
    const rifa = await api.getRifa(rifaId);
    alert(`Rifa selecionada: ${rifa.title}\nImplemente aqui a lógica de seleção de números!`);
  } catch (error) {
    alert('Erro ao carregar detalhes da rifa');
  }
};

// Carregar rifas ao inicializar
loadRifas();