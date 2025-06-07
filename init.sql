CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'aluno',
  nome VARCHAR(255) NOT NULL
);

INSERT INTO usuarios (nome, email, senha, role) VALUES
('Administrador', 'admin@buriti.com', '$2b$10$Z1YHxw691G3UE9OQP1i1m.B1hb.3H5QB1uoDmkYMOtHYQmi16TK.a', 'admin'),
('Hemerson Daniel Teste Atualizado 4', 'joao@aluno.com', '$2b$10$Z1YHxw691G3UE9OQP1i1m.B1hb.3H5QB1uoDmkYMOtHYQmi16TK.a', 'aluno')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS cursos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  descricao TEXT,
  modality VARCHAR(50),
  duration VARCHAR(10),
  price DECIMAL(10, 2),
  status VARCHAR(20) DEFAULT 'Rascunho',
  imagem VARCHAR(255)
);
