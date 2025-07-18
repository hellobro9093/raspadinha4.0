// Nova API local - substitui a API externa https://r-client.dancsolutions.com/api
const API_BASE = 'http://localhost:3001/api';

// Função para fazer chamadas à API
async function apiCall(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  if (!response.ok) {
    throw new Error('Erro na requisição');
  }
  return response.json();
}

// Exportar as mesmas funções que o sistema original usava
export const api = {
  // Configurações
  async getSettings() {
    return fetch(`${API_BASE}/settings`).then(r => r.json());
  },

  // Rifas
  async getRifas() {
    return apiCall('/rifas');
  },

  async getRifa(id) {
    return fetch(`${API_BASE}/rifas/${id}`).then(r => r.json());
  },

  // Compras
  async createPurchase(data) {
    return apiCall('/purchase', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Funções adicionais que podem ser necessárias
  async updatePurchaseStatus(id, status) {
    return apiCall(`/purchases/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }
};

// Aplicar configurações de estilo dinamicamente
export async function applySettings() {
  try {
    const settings = await api.getSettings();
    
    // Aplicar cores personalizadas
    if (settings.primary_color) {
      document.documentElement.style.setProperty('--primary-color', settings.primary_color);
    }
    
    if (settings.secondary_color) {
      document.documentElement.style.setProperty('--secondary-color', settings.secondary_color);
    }
    
    // Aplicar título
    if (settings.site_title) {
      document.title = settings.site_title;
      const titleElements = document.querySelectorAll('.site-title');
      titleElements.forEach(el => el.textContent = settings.site_title);
    }
    
    // Aplicar logo
    if (settings.logo_url) {
      const logoElements = document.querySelectorAll('.site-logo');
      logoElements.forEach(el => el.src = `http://localhost:3001${settings.logo_url}`);
    }
    
    return settings;
  } catch (error) {
    console.error('Erro ao aplicar configurações:', error);
    return {};
  }
}

// Manter compatibilidade com o código existente
window.api = api;
window.applySettings = applySettings;