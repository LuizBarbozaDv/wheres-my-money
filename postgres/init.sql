-- Fatura App - Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Faturas (invoice headers)
CREATE TABLE faturas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL,
  mes_referencia VARCHAR(7) NOT NULL, -- formato: YYYY-MM
  data_vencimento DATE,
  valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cartao VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorias
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(100) NOT NULL UNIQUE,
  icone VARCHAR(50) DEFAULT '💳',
  cor VARCHAR(20) DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de categorias padrão
INSERT INTO categorias (nome, icone, cor) VALUES
  ('Alimentação', '🍔', '#FF5722'),   
  ('Transporte', '🚗', '#2196F3'),    
  ('Saúde', '💊', '#00C853'),        
  ('Lazer', '🎮', '#9C27B0'),         
  ('Educação', '📚', '#00BCD4'),     
  ('Vestuário', '👕', '#E91E63'),      
  ('Moradia', '🏠', '#FF9800'),      
  ('Viagem', '✈️', '#009688'),       
  ('Assinaturas', '📺', '#673AB7'),    
  ('Supermercado', '🛒', '#8BC34A'),
  ('Restaurante', '🍽️', '#FF3D00'),  
  ('Outros', '💳', '#5C6BC0');

-- Transações
CREATE TABLE transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fatura_id UUID NOT NULL REFERENCES faturas(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
  descricao VARCHAR(255) NOT NULL,
  estabelecimento VARCHAR(255),
  valor NUMERIC(12, 2) NOT NULL,
  data DATE NOT NULL,
  parcela_atual INT DEFAULT 1,
  parcelas_total INT DEFAULT 1,
  tipo VARCHAR(20) DEFAULT 'debito' CHECK (tipo IN ('debito', 'credito', 'estorno')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_transacoes_fatura_id ON transacoes(fatura_id);
CREATE INDEX idx_transacoes_categoria_id ON transacoes(categoria_id);
CREATE INDEX idx_transacoes_data ON transacoes(data);
CREATE INDEX idx_transacoes_estabelecimento ON transacoes(estabelecimento);
CREATE INDEX idx_faturas_mes ON faturas(mes_referencia);

-- View: resumo por categoria
CREATE OR REPLACE VIEW vw_resumo_categoria AS
SELECT
  t.fatura_id,
  c.id AS categoria_id,
  c.nome AS categoria,
  c.icone,
  c.cor,
  COUNT(t.id) AS total_transacoes,
  SUM(CASE WHEN t.tipo = 'debito' THEN t.valor ELSE 0 END) AS total_gasto,
  SUM(CASE WHEN t.tipo = 'credito' OR t.tipo = 'estorno' THEN t.valor ELSE 0 END) AS total_credito
FROM transacoes t
LEFT JOIN categorias c ON t.categoria_id = c.id
GROUP BY t.fatura_id, c.id, c.nome, c.icone, c.cor;

-- View: resumo por estabelecimento
CREATE OR REPLACE VIEW vw_resumo_estabelecimento AS
SELECT
  fatura_id,
  COALESCE(estabelecimento, descricao) AS estabelecimento,
  COUNT(id) AS total_transacoes,
  SUM(valor) AS total_gasto
FROM transacoes
WHERE tipo = 'debito'
GROUP BY fatura_id, COALESCE(estabelecimento, descricao)
ORDER BY total_gasto DESC;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_faturas_updated_at
  BEFORE UPDATE ON faturas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transacoes_updated_at
  BEFORE UPDATE ON transacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
