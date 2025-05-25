-- TABELA: usuários (alunos e admins)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  senha VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'aluno'
);

-- TABELA: cursos
CREATE TABLE IF NOT EXISTS cursos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  duracao INTEGER,
  preco VARCHAR(20),
  imagem TEXT,
  categoria VARCHAR(100),
  modalidade VARCHAR(50),
  status VARCHAR(20) DEFAULT 'rascunho'
);

-- TABELA: módulos
CREATE TABLE IF NOT EXISTS modulos (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  ordem INTEGER
);

-- TABELA: aulas (vídeos)
CREATE TABLE IF NOT EXISTS aulas (
  id SERIAL PRIMARY KEY,
  modulo_id INTEGER REFERENCES modulos(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  video_url TEXT,
  material_url TEXT,
  ordem INTEGER
);

-- TABELA: matrículas
CREATE TABLE IF NOT EXISTS matriculas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ativo',
  data_matricula TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA: tarefas
CREATE TABLE IF NOT EXISTS tarefas (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200),
  descricao TEXT
);

-- TABELA: envios de tarefas
CREATE TABLE IF NOT EXISTS envios (
  id SERIAL PRIMARY KEY,
  tarefa_id INTEGER REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  arquivo_url TEXT,
  data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA: testes (quizzes)
CREATE TABLE IF NOT EXISTS testes (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200),
  descricao TEXT,
  status VARCHAR(20) DEFAULT 'pendente',
  nota DECIMAL
);

-- TABELA: notas por teste
CREATE TABLE IF NOT EXISTS notas (
  id SERIAL PRIMARY KEY,
  teste_id INTEGER REFERENCES testes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nota DECIMAL
);

-- TABELA: fóruns
CREATE TABLE IF NOT EXISTS foruns (
  id SERIAL PRIMARY KEY,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
  titulo VARCHAR(200)
);

-- TABELA: mensagens nos fóruns
CREATE TABLE IF NOT EXISTS mensagens (
  id SERIAL PRIMARY KEY,
  forum_id INTEGER REFERENCES foruns(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  mensagem TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

