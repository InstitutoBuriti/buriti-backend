const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./db');
const app = express();
const PORT = process.env.PORT || 10000; // Usa a porta do Render ou 10000 como fallback

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido.'), false);
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log('Token ausente na requisição.');
    return res.status(401).json({ error: 'Acesso não autorizado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'seu-segredo-jwt', (err, user) => {
    if (err) {
      console.log('Erro ao verificar token:', err.message);
      return res.status(403).json({ error: 'Token inválido.' });
    }
    req.user = user;
    next();
  });
};

const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  next();
};

// Rota de teste
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// Rota raiz para redirecionar ou informar
app.get('/', (req, res) => {
  res.json({ message: 'Bem-vindo à API do Buriti Backend. Use /api/login para autenticação ou outras rotas como /api/cursos.' });
});

// Rota de login
app.post('/api/login', async (req, res) => {
  console.log('Requisição recebida em /api/login:', req.body);
  const { email, senha } = req.body;
  if (!email || !senha) {
    console.log('Erro: Email ou senha ausentes');
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  try {
    console.log('Executando consulta no banco de dados para email:', email);
    const queryUser = 'SELECT * FROM usuarios WHERE email = $1';
    const result = await db.query(queryUser, [email]);
    console.log('Resultado da consulta:', result.rows);
    const user = result.rows[0];

    if (!user) {
      console.log('Usuário não encontrado para email:', email);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    console.log('Verificando senha para usuário:', user);
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      console.log('Senha inválida para usuário:', user.email);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, nome: user.nome }, process.env.JWT_SECRET || 'seu-segredo-jwt', { expiresIn: '1h' });
    const responseData = { token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } };
    console.log('Resposta a ser enviada:', responseData);
    res.json(responseData);
  } catch (err) {
    console.error('Erro ao realizar login:', err);
    res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

// Rotas de Cursos
app.get('/api/cursos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cursos');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar cursos:', err);
    res.status(500).json({ error: 'Erro ao buscar cursos.' });
  }
});

app.get('/api/cursos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cursoResult = await db.query('SELECT * FROM cursos WHERE id = $1', [id]);
    if (cursoResult.rows.length === 0) return res.status(404).json({ error: 'Curso não encontrado.' });

    const curso = cursoResult.rows[0];
    const modulosResult = await db.query('SELECT * FROM modulos WHERE curso_id = $1 ORDER BY ordem', [id]);
    const modulos = modulosResult.rows;

    for (let modulo of modulos) {
      const aulasResult = await db.query('SELECT * FROM aulas WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);
      modulo.lessons = aulasResult.rows;
    }

    curso.modules = modulos;
    res.json(curso);
  } catch (err) {
    console.error('Erro ao buscar curso:', err);
    res.status(500).json({ error: 'Erro ao buscar curso.' });
  }
});

app.post('/api/cursos', authenticateToken, authorizeAdmin, upload.single('imagem'), async (req, res) => {
  const { title, descricao, modality, duration, price, status } = req.body;
  if (!title || !descricao || !duration || !price) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }
  if (!/^\d+h$/.test(duration)) {
    return res.status(400).json({ error: "Duração deve estar no formato 'Xh' (ex: 40h)." });
  }
  const imagem = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await db.query(
      'INSERT INTO cursos (title, descricao, modality, duration, price, status, imagem) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [title, descricao, modality, duration, price, status || 'Rascunho', imagem]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar curso:', err);
    res.status(500).json({ error: 'Erro ao criar curso.' });
  }
});

app.put('/api/cursos/:id', authenticateToken, authorizeAdmin, upload.single('imagem'), async (req, res) => {
  const { id } = req.params;
  const { title, descricao, modality, duration, price, status } = req.body;

  if (!title || !duration || !/^\d+h$/.test(duration)) {
    return res.status(400).json({ error: 'Campos inválidos.' });
  }

  try {
    const cursoAtual = await db.query('SELECT imagem FROM cursos WHERE id = $1', [id]);
    if (cursoAtual.rows.length === 0) return res.status(404).json({ error: 'Curso não encontrado.' });

    let novaImagem = cursoAtual.rows[0].imagem;
    if (req.file) {
      novaImagem = `/uploads/${req.file.filename}`;
      if (cursoAtual.rows[0].imagem) {
        const caminhoAntigo = path.join(__dirname, cursoAtual.rows[0].imagem);
        if (fs.existsSync(caminhoAntigo)) fs.unlinkSync(caminhoAntigo);
      }
    }

    const result = await db.query(
      `UPDATE cursos SET title=$1, descricao=$2, modality=$3, duration=$4, price=$5, status=$6, imagem=$7 WHERE id=$8 RETURNING *`,
      [title, descricao, modality, duration, price, status, novaImagem, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar curso:', err);
    res.status(500).json({ error: 'Erro ao atualizar curso.' });
  }
});

app.delete('/api/cursos/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const imagemQuery = await db.query('SELECT imagem FROM cursos WHERE id = $1', [id]);
    if (imagemQuery.rows.length === 0) return res.status(404).json({ error: 'Curso não encontrado.' });

    const imagem = imagemQuery.rows[0].imagem;
    if (imagem) {
      const caminho = path.join(__dirname, imagem);
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    }

    await db.query('DELETE FROM modulos WHERE curso_id = $1', [id]);
    await db.query('DELETE FROM cursos WHERE id = $1', [id]);

    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar curso:', err);
    res.status(500).json({ error: 'Erro ao deletar curso.' });
  }
});

app.get('/api/cursos/:id/conteudo', async (req, res) => {
  const { id } = req.params;

  try {
    const modulosResult = await db.query(
      'SELECT * FROM modulos WHERE curso_id = $1 ORDER BY ordem',
      [id]
    );
    const modulos = modulosResult.rows;

    for (let modulo of modulos) {
      const videosResult = await db.query('SELECT * FROM videos WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);
      const liveSessionsResult = await db.query('SELECT * FROM live_sessions WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);
      const quizzesResult = await db.query('SELECT * FROM quizzes WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);
      const forunsResult = await db.query('SELECT * FROM foruns WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);
      const uploadsResult = await db.query('SELECT * FROM uploads WHERE modulo_id = $1 ORDER BY ordem', [modulo.id]);

      modulo.videos = videosResult.rows;
      modulo.liveSessions = liveSessionsResult.rows;
      modulo.quizzes = quizzesResult.rows;
      modulo.foruns = forunsResult.rows;
      modulo.uploads = uploadsResult.rows;
    }

    res.json(modulos);
  } catch (err) {
    console.error('Erro ao buscar conteúdo do curso:', err);
    res.status(500).json({ error: 'Erro ao buscar conteúdo.' });
  }
});

// Rotas de Módulos
app.post('/api/modulos', authenticateToken, authorizeAdmin, async (req, res) => {
  const { cursoId, titulo, ordem } = req.body;
  if (!cursoId || !titulo) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const countResult = await db.query('SELECT COUNT(*) FROM modulos WHERE curso_id = $1', [cursoId]);
    const ordemFinal = ordem || parseInt(countResult.rows[0].count) + 1;

    const result = await db.query(
      'INSERT INTO modulos (curso_id, titulo, ordem) VALUES ($1, $2, $3) RETURNING *',
      [cursoId, titulo, ordemFinal]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar módulo:', err);
    res.status(500).json({ error: 'Erro ao criar módulo.' });
  }
});

app.delete('/api/modulos/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM aulas WHERE modulo_id = $1', [id]);
    await db.query('DELETE FROM modulos WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao excluir módulo:', err);
    res.status(500).json({ error: 'Erro ao excluir módulo.' });
  }
});

app.put('/api/cursos/:id/reorder-modulos', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { modulos: novosModulos } = req.body;

  if (!Array.isArray(novosModulos)) {
    return res.status(400).json({ error: 'Formato inválido para modulos.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    for (let i = 0; i < novosModulos.length; i++) {
      const { id: moduloId } = novosModulos[i];
      await client.query('UPDATE modulos SET ordem = $1 WHERE id = $2 AND curso_id = $3', [i + 1, moduloId, id]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem dos módulos atualizada.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar módulos:', err);
    res.status(500).json({ error: 'Erro ao reordenar módulos.' });
  } finally {
    client.release();
  }
});

// Rotas de Aulas
app.post('/api/aulas', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId, titulo, ordem } = req.body;
  if (!moduloId || !titulo) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const countResult = await db.query('SELECT COUNT(*) FROM aulas WHERE modulo_id = $1', [moduloId]);
    const ordemFinal = ordem || parseInt(countResult.rows[0].count) + 1;

    const result = await db.query(
      'INSERT INTO aulas (modulo_id, titulo, ordem) VALUES ($1, $2, $3) RETURNING *',
      [moduloId, titulo, ordemFinal]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar aula:', err);
    res.status(500).json({ error: 'Erro ao criar aula.' });
  }
});

app.put('/api/aulas/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { titulo } = req.body;

  if (!titulo) return res.status(400).json({ error: 'Título é obrigatório.' });

  try {
    const result = await db.query(
      'UPDATE aulas SET titulo = $1 WHERE id = $2 RETURNING *',
      [titulo, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Aula não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar aula:', err);
    res.status(500).json({ error: 'Erro ao atualizar aula.' });
  }
});

app.delete('/api/aulas/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM aulas WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Aula não encontrada.' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar aula:', err);
    res.status(500).json({ error: 'Erro ao deletar aula.' });
  }
});

// Rotas de Vídeos
app.post('/api/videos', authenticateToken, authorizeAdmin, upload.single('file'), async (req, res) => {
  const { moduloId, titulo, ordem } = req.body;
  if (!moduloId || !titulo || !req.file) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }
  const url = `/uploads/${req.file.filename}`;

  try {
    const result = await db.query(
      'INSERT INTO videos (modulo_id, titulo, url, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
      [moduloId, titulo, url, ordem || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao salvar vídeo:', err);
    res.status(500).json({ error: 'Erro ao salvar vídeo.' });
  }
});

app.delete('/api/videos/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('SELECT url FROM videos WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vídeo não encontrado.' });

    const caminho = path.join(__dirname, result.rows[0].url);
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);

    await db.query('DELETE FROM videos WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar vídeo:', err);
    res.status(500).json({ error: 'Erro ao deletar vídeo.' });
  }
});

app.put('/api/cursos/:id/modulos/:moduloId/reorder-videos', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId } = req.params;
  const { itens } = req.body;

  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Formato inválido para itens.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < itens.length; i++) {
      await client.query('UPDATE videos SET ordem = $1 WHERE id = $2 AND modulo_id = $3', [i + 1, itens[i].id, moduloId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem dos vídeos atualizada.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar vídeos:', err);
    res.status(500).json({ error: 'Erro ao reordenar vídeos.' });
  } finally {
    client.release();
  }
});

// Rotas de Aulas ao Vivo
app.post('/api/liveSessions', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId, titulo, linkJitsi, dataHora, senha } = req.body;
  if (!moduloId || !titulo || !linkJitsi || !dataHora) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const ordemResult = await db.query(
      'SELECT COUNT(*) FROM live_sessions WHERE modulo_id = $1',
      [moduloId]
    );
    const ordem = parseInt(ordemResult.rows[0].count) + 1;

    const result = await db.query(
      'INSERT INTO live_sessions (modulo_id, titulo, link_jitsi, data_hora, senha, ordem) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [moduloId, titulo, linkJitsi, dataHora, senha, ordem]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar aula ao vivo:', err);
    res.status(500).json({ error: 'Erro ao criar aula ao vivo.' });
  }
});

app.delete('/api/liveSessions/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM live_sessions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Aula ao vivo não encontrada.' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao excluir aula ao vivo:', err);
    res.status(500).json({ error: 'Erro ao excluir aula ao vivo.' });
  }
});

app.put('/api/cursos/:id/modulos/:moduloId/reorder-liveSessions', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId } = req.params;
  const { itens } = req.body;

  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Formato inválido para itens.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < itens.length; i++) {
      await client.query('UPDATE live_sessions SET ordem = $1 WHERE id = $2 AND modulo_id = $3', [i + 1, itens[i].id, moduloId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem das aulas ao vivo atualizada.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar aulas ao vivo:', err);
    res.status(500).json({ error: 'Erro ao reordenar aulas ao vivo.' });
  } finally {
    client.release();
  }
});

// Rotas de Quizzes
app.post('/api/quizzes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId, pergunta, opcoes, correta, notaMinima, ordem } = req.body;
  if (!moduloId || !pergunta || !opcoes || !correta || !notaMinima) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const ordemFinal = ordem || (
      parseInt((await db.query('SELECT COUNT(*) FROM quizzes WHERE modulo_id = $1', [moduloId])).rows[0].count) + 1
    );

    const result = await db.query(
      'INSERT INTO quizzes (modulo_id, pergunta, opcoes, correta, nota_minima, ordem) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [moduloId, pergunta, JSON.stringify(opcoes), correta, notaMinima, ordemFinal]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar quiz:', err);
    res.status(500).json({ error: 'Erro ao criar quiz.' });
  }
});

app.delete('/api/quizzes/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM quizzes WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quiz não encontrado.' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao excluir quiz:', err);
    res.status(500).json({ error: 'Erro ao excluir quiz.' });
  }
});

app.put('/api/cursos/:id/modulos/:moduloId/reorder-quizzes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId } = req.params;
  const { itens } = req.body;

  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Formato inválido para itens.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < itens.length; i++) {
      await client.query('UPDATE quizzes SET ordem = $1 WHERE id = $2 AND modulo_id = $3', [i + 1, itens[i].id, moduloId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem dos quizzes atualizada.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar quizzes:', err);
    res.status(500).json({ error: 'Erro ao reordenar quizzes.' });
  } finally {
    client.release();
  }
});

app.post('/api/quizzes/:id/responses', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { resposta } = req.body;

  if (!resposta) return res.status(400).json({ error: 'Resposta é obrigatória.' });

  try {
    const quizResult = await db.query('SELECT * FROM quizzes WHERE id = $1', [id]);
    if (quizResult.rows.length === 0) return res.status(404).json({ error: 'Quiz não encontrado.' });
    const quiz = quizResult.rows[0];

    const moduloResult = await db.query('SELECT curso_id FROM modulos WHERE id = $1', [quiz.modulo_id]);
    if (moduloResult.rows.length === 0) return res.status(404).json({ error: 'Módulo não encontrado.' });

    const cursoId = moduloResult.rows[0].curso_id;
    const matriculaResult = await db.query(
      'SELECT * FROM matriculas WHERE usuario_id = $1 AND curso_id = $2 AND status = $3',
      [req.user.id, cursoId, 'ativo']
    );
    if (matriculaResult.rows.length === 0) return res.status(403).json({ error: 'Usuário não matriculado no curso.' });

    const acerto = resposta === quiz.correta;
    const nota = acerto ? quiz.nota_minima : 0;

    await db.query(
      'INSERT INTO quiz_respostas (quiz_id, user_id, resposta, acerto, nota) VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.id, resposta, acerto, nota]
    );

    res.json({ acerto, nota });
  } catch (err) {
    console.error('Erro ao registrar resposta do quiz:', err);
    res.status(500).json({ error: 'Erro ao registrar resposta do quiz.' });
  }
});

// Rotas de Fóruns
app.post('/api/foruns', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId, titulo, ordem } = req.body;
  if (!moduloId || !titulo) return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });

  try {
    const modulo = await db.query('SELECT curso_id FROM modulos WHERE id = $1', [moduloId]);
    if (modulo.rows.length === 0) return res.status(404).json({ error: 'Módulo não encontrado.' });

    const cursoId = modulo.rows[0].curso_id;

    const novaOrdem = ordem || (
      parseInt((await db.query('SELECT COUNT(*) FROM foruns WHERE modulo_id = $1', [moduloId])).rows[0].count) + 1
    );

    const result = await db.query(
      'INSERT INTO foruns (modulo_id, curso_id, titulo, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
      [moduloId, cursoId, titulo, novaOrdem]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar fórum:', err);
    res.status(500).json({ error: 'Erro ao criar fórum.' });
  }
});

app.delete('/api/foruns/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM mensagens WHERE forum_id = $1', [id]);
    await db.query('DELETE FROM foruns WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar fórum:', err);
    res.status(500).json({ error: 'Erro ao deletar fórum.' });
  }
});

app.get('/api/foruns', authenticateToken, async (req, res) => {
  try {
    const matriculasAtivas = await db.query('SELECT curso_id FROM matriculas WHERE usuario_id = $1 AND status = $2', [req.user.id, 'ativo']);
    const cursoIds = matriculasAtivas.rows.map(m => m.curso_id);

    if (cursoIds.length === 0) return res.json([]);

    const result = await db.query(
      'SELECT * FROM foruns WHERE curso_id = ANY($1::int[]) ORDER BY curso_id, ordem',
      [cursoIds]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar fóruns:', err);
    res.status(500).json({ error: 'Erro ao buscar fóruns.' });
  }
});

app.post('/api/foruns/:id/messages', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória.' });

  try {
    const forumResult = await db.query('SELECT curso_id FROM foruns WHERE id = $1', [id]);
    if (forumResult.rows.length === 0) return res.status(404).json({ error: 'Fórum não encontrado.' });

    const cursoId = forumResult.rows[0].curso_id;
    const matriculaResult = await db.query(
      'SELECT * FROM matriculas WHERE usuario_id = $1 AND curso_id = $2 AND status = $3',
      [req.user.id, cursoId, 'ativo']
    );
    if (matriculaResult.rows.length === 0) return res.status(403).json({ error: 'Usuário não matriculado no curso.' });

    await db.query(
      'INSERT INTO mensagens (forum_id, user_id, user_nome, message, timestamp) VALUES ($1, $2, $3, $4, NOW())',
      [id, req.user.id, req.user.nome, message]
    );

    res.status(201).json({ message: 'Mensagem registrada.' });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

app.get('/api/foruns/:id/messages', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const forumResult = await db.query('SELECT curso_id FROM foruns WHERE id = $1', [id]);
    if (forumResult.rows.length === 0) return res.status(404).json({ error: 'Fórum não encontrado.' });

    const cursoId = forumResult.rows[0].curso_id;
    const matriculaResult = await db.query(
      'SELECT * FROM matriculas WHERE usuario_id = $1 AND curso_id = $2 AND status = $3',
      [req.user.id, cursoId, 'ativo']
    );
    if (matriculaResult.rows.length === 0) return res.status(403).json({ error: 'Usuário não matriculado no curso.' });

    const result = await db.query(
      'SELECT * FROM mensagens WHERE forum_id = $1 ORDER BY timestamp ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
});

// Rotas de Uploads
app.post('/api/uploads', authenticateToken, authorizeAdmin, upload.single('file'), async (req, res) => {
  const { moduloId, titulo, instrucoes, ordem } = req.body;
  if (!moduloId || !titulo || !req.file) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const novaOrdem = ordem || (
      parseInt((await db.query('SELECT COUNT(*) FROM uploads WHERE modulo_id = $1', [moduloId])).rows[0].count) + 1
    );

    const result = await db.query(
      'INSERT INTO uploads (modulo_id, titulo, instrucoes, url, ordem) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [moduloId, titulo, instrucoes, `/uploads/${req.file.filename}`, novaOrdem]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar upload:', err);
    res.status(500).json({ error: 'Erro ao criar upload.' });
  }
});

app.get('/api/uploads/:moduloId', authenticateToken, async (req, res) => {
  const { moduloId } = req.params;
  try {
    const result = await db.query(
      'SELECT * FROM uploads WHERE modulo_id = $1 ORDER BY ordem',
      [moduloId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar uploads:', err);
    res.status(500).json({ error: 'Erro ao buscar uploads.' });
  }
});

app.put('/api/cursos/:id/modulos/:moduloId/reorder-uploads', authenticateToken, authorizeAdmin, async (req, res) => {
  const { moduloId } = req.params;
  const { itens } = req.body;

  if (!Array.isArray(itens)) return res.status(400).json({ error: 'Formato inválido para itens.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < itens.length; i++) {
      await client.query('UPDATE uploads SET ordem = $1 WHERE id = $2 AND modulo_id = $3', [i + 1, itens[i].id, moduloId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem dos uploads atualizada.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reordenar uploads:', err);
    res.status(500).json({ error: 'Erro ao reordenar uploads.' });
  } finally {
    client.release();
  }
});

app.delete('/api/uploads/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const uploadResult = await db.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadResult.rows.length === 0) return res.status(404).json({ error: 'Upload não encontrado.' });

    const caminho = path.join(__dirname, uploadResult.rows[0].url);
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);

    await db.query('DELETE FROM uploads WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar upload:', err);
    res.status(500).json({ error: 'Erro ao deletar upload.' });
  }
});

// Rotas de Tarefas
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const matriculasResult = await db.query(
      'SELECT curso_id FROM matriculas WHERE usuario_id = $1 AND status = $2',
      [req.user.id, 'ativo']
    );
    const cursoIds = matriculasResult.rows.map(m => m.curso_id);
    const result = await db.query(
      'SELECT * FROM tarefas WHERE curso_id = ANY($1::int[])',
      [cursoIds]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar tarefas:', err);
    res.status(500).json({ error: 'Erro ao buscar tarefas.' });
  }
});

app.post('/api/tasks', authenticateToken, authorizeAdmin, async (req, res) => {
  const { curso_id, title, description } = req.body;
  if (!curso_id || !title || !description) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO tarefas (curso_id, title, description, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [curso_id, title, description, 'pendente']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar tarefa:', err);
    res.status(500).json({ error: 'Erro ao criar tarefa.' });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

  try {
    const result = await db.query(
      'UPDATE tarefas SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar tarefa:', err);
    res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
  }
});

app.delete('/api/tasks/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM tarefas WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar tarefa:', err);
    res.status(500).json({ error: 'Erro ao deletar tarefa.' });
  }
});

app.post('/api/tasks/:id/response', authenticateToken, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Arquivo é obrigatório.' });

  try {
    const tarefaResult = await db.query('SELECT curso_id FROM tarefas WHERE id = $1', [id]);
    if (tarefaResult.rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada.' });

    const cursoId = tarefaResult.rows[0].curso_id;
    const matriculaResult = await db.query(
      'SELECT * FROM matriculas WHERE usuario_id = $1 AND curso_id = $2 AND status = $3',
      [req.user.id, cursoId, 'ativo']
    );
    if (matriculaResult.rows.length === 0) return res.status(403).json({ error: 'Usuário não matriculado no curso.' });

    const url = `/uploads/${req.file.filename}`;
    await db.query(
      'INSERT INTO tarefa_respostas (tarefa_id, user_id, url) VALUES ($1, $2, $3)',
      [id, req.user.id, url]
    );

    await db.query('UPDATE tarefas SET status = $1 WHERE id = $2', ['enviado', id]);
    res.status(201).json({ message: 'Resposta enviada.' });
  } catch (err) {
    console.error('Erro ao enviar resposta da tarefa:', err);
    res.status(500).json({ error: 'Erro ao enviar resposta da tarefa.' });
  }
});

// Rotas de Testes
app.get('/api/tests', authenticateToken, async (req, res) => {
  try {
    const matriculasResult = await db.query(
      'SELECT curso_id FROM matriculas WHERE usuario_id = $1 AND status = $2',
      [req.user.id, 'ativo']
    );
    const cursoIds = matriculasResult.rows.map(m => m.curso_id);
    const result = await db.query(
      'SELECT * FROM testes WHERE curso_id = ANY($1::int[])',
      [cursoIds]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar testes:', err);
    res.status(500).json({ error: 'Erro ao buscar testes.' });
  }
});

app.post('/api/tests', authenticateToken, authorizeAdmin, async (req, res) => {
  const { curso_id, title, description } = req.body;
  if (!curso_id || !title || !description) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO testes (curso_id, title, description, status, nota) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [curso_id, title, description, 'pendente', null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar teste:', err);
    res.status(500).json({ error: 'Erro ao criar teste.' });
  }
});

app.put('/api/tests/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, nota } = req.body;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

  try {
    const result = await db.query(
      'UPDATE testes SET status = $1, nota = $2 WHERE id = $3 RETURNING *',
      [status, nota ?? null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teste não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar teste:', err);
    res.status(500).json({ error: 'Erro ao atualizar teste.' });
  }
});

app.delete('/api/tests/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM testes WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar teste:', err);
    res.status(500).json({ error: 'Erro ao deletar teste.' });
  }
});

// Rotas de Notas
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM notas WHERE user_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar notas:', err);
    res.status(500).json({ error: 'Erro ao buscar notas.' });
  }
});

app.post('/api/notes', authenticateToken, authorizeAdmin, async (req, res) => {
  const { user_id, curso_id, nota } = req.body;
  if (!user_id || !curso_id || !nota) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO notas (user_id, curso_id, nota) VALUES ($1, $2, $3) RETURNING *',
      [user_id, curso_id, nota]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao registrar nota:', err);
    res.status(500).json({ error: 'Erro ao registrar nota.' });
  }
});

// Rotas de Pessoas
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const matriculasUser = await db.query(
      'SELECT curso_id FROM matriculas WHERE usuario_id = $1 AND status = $2',
      [req.user.id, 'ativo']
    );
    const cursosDoUsuario = matriculasUser.rows.map(row => row.curso_id);

    if (cursosDoUsuario.length === 0) return res.json([]);

    const usuarios = await db.query(
      `SELECT DISTINCT u.id, u.nome, u.email, u.role
       FROM usuarios u
       JOIN matriculas m ON m.usuario_id = u.id
       WHERE u.id != $1 AND m.status = 'ativo' AND m.curso_id = ANY($2::int[])`,
      [req.user.id, cursosDoUsuario]
    );

    const usuariosComCursos = await Promise.all(usuarios.rows.map(async user => {
      const cursosComuns = await db.query(
        `SELECT c.title
         FROM cursos c
         JOIN matriculas m ON m.curso_id = c.id
         WHERE m.usuario_id = $1 AND m.curso_id = ANY($2::int[]) AND m.status = 'ativo'`,
        [user.id, cursosDoUsuario]
      );
      return {
        ...user,
        cursos: cursosComuns.rows.map(c => c.title)
      };
    }));

    res.json(usuariosComCursos);
  } catch (err) {
    console.error('Erro ao buscar usuários:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

// Rotas de Certificados
app.get('/api/certificates/:courseId', authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  try {
    const cursoResult = await db.query('SELECT * FROM cursos WHERE id = $1', [courseId]);
    if (cursoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Curso não encontrado.' });
    }
    const curso = cursoResult.rows[0];

    const modulosResult = await db.query('SELECT id FROM modulos WHERE curso_id = $1', [courseId]);
    const moduloIds = modulosResult.rows.map(m => m.id);

    const totalAulasResult = await db.query(
      'SELECT COUNT(*) FROM aulas WHERE modulo_id = ANY($1::int[])',
      [moduloIds]
    );
    const totalAulas = parseInt(totalAulasResult.rows[0].count);

    const assistidasResult = await db.query(
      'SELECT COUNT(*) FROM progresso WHERE user_id = $1 AND curso_id = $2 AND assistida = true',
      [req.user.id, courseId]
    );
    const aulasAssistidas = parseInt(assistidasResult.rows[0].count);

    if (aulasAssistidas === totalAulas && totalAulas > 0) {
      res.json({
        certificate: `Certificado de conclusão: ${curso.title} - Aluno(a): ${req.user.nome}`
      });
    } else {
      res.status(403).json({ error: 'Curso ainda não concluído.' });
    }
  } catch (err) {
    console.error('Erro ao gerar certificado:', err);
    res.status(500).json({ error: 'Erro ao gerar certificado.' });
  }
});

// Rotas de Progresso
app.get('/api/aluno/progresso/admin', authenticateToken, authorizeAdmin, async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) return res.status(400).json({ error: 'Parâmetro courseId é obrigatório.' });

  try {
    const alunosResult = await db.query("SELECT id, nome FROM usuarios WHERE role = 'aluno'");
    const cursoModulos = await db.query('SELECT id FROM modulos WHERE curso_id = $1', [courseId]);
    const moduloIds = cursoModulos.rows.map(m => m.id);

    const totalAulas = await db.query(
      `SELECT COUNT(*) FROM aulas WHERE modulo_id = ANY($1::int[])`,
      [moduloIds]
    );
    const total = parseInt(totalAulas.rows[0].count);

    const progressoAlunos = await Promise.all(
      alunosResult.rows.map(async (aluno) => {
        const assistidas = await db.query(
          `SELECT COUNT(*) FROM progresso WHERE user_id = $1 AND curso_id = $2 AND assistida = true`,
          [aluno.id, courseId]
        );
        const concluido = parseInt(assistidas.rows[0].count);
        const percentual = total > 0 ? Math.round((concluido / total) * 100) : 0;
        return { id: aluno.id, name: aluno.nome, progress: percentual };
      })
    );

    res.json(progressoAlunos);
  } catch (err) {
    console.error('Erro ao buscar progresso dos alunos:', err);
    res.status(500).json({ error: 'Erro ao buscar progresso.' });
  }
});

app.get('/api/progress/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso não autorizado.' });
  }

  try {
    const result = await db.query('SELECT * FROM progresso WHERE user_id = $1', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar progresso:', err);
    res.status(500).json({ error: 'Erro ao buscar progresso.' });
  }
});

app.put('/api/progress/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { curso_id, modulo_id, aula_id, assistida } = req.body;
  if (!curso_id || !modulo_id || !aula_id || assistida === undefined) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  if (req.user.id !== parseInt(userId)) {
    return res.status(403).json({ error: 'Acesso não autorizado.' });
  }

  try {
    const existente = await db.query(
      `SELECT * FROM progresso WHERE user_id = $1 AND curso_id = $2 AND modulo_id = $3 AND aula_id = $4`,
      [userId, curso_id, modulo_id, aula_id]
    );

    if (existente.rows.length > 0) {
      await db.query(
        `UPDATE progresso SET assistida = $1 WHERE user_id = $2 AND curso_id = $3 AND modulo_id = $4 AND aula_id = $5`,
        [assistida, userId, curso_id, modulo_id, aula_id]
      );
    } else {
      await db.query(
        `INSERT INTO progresso (user_id, curso_id, modulo_id, aula_id, assistida) VALUES ($1, $2, $3, $4, $5)`,
        [userId, curso_id, modulo_id, aula_id, assistida]
      );
    }

    res.json({ message: 'Progresso atualizado.' });
  } catch (err) {
    console.error('Erro ao atualizar progresso:', err);
    res.status(500).json({ error: 'Erro ao atualizar progresso.' });
  }
});

// Rotas de Matrículas
app.get('/api/enrollments', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM matriculas WHERE usuario_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar matrículas:', err);
    res.status(500).json({ error: 'Erro ao buscar matrículas.' });
  }
});

app.post('/api/enrollments', authenticateToken, authorizeAdmin, async (req, res) => {
  const { user_id, curso_id, status } = req.body;
  if (!user_id || !curso_id) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO matriculas (usuario_id, curso_id, status) VALUES ($1, $2, $3) RETURNING *',
      [user_id, curso_id, status || 'ativo']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar matrícula:', err);
    res.status(500).json({ error: 'Erro ao criar matrícula.' });
  }
});

app.put('/api/enrollments/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

  try {
    const result = await db.query(
      'UPDATE matriculas SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar matrícula:', err);
    res.status(500).json({ error: 'Erro ao atualizar matrícula.' });
  }
});

app.delete('/api/enrollments/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM matriculas WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar matrícula:', err);
    res.status(500).json({ error: 'Erro ao deletar matrícula.' });
  }
});

// Rota para listar alunos por curso (admin)
app.get('/api/admin/alunos', authenticateToken, authorizeAdmin, async (req, res) => {
  const { cursoId } = req.query;

  if (!cursoId) {
    return res.status(400).json({ error: 'O parâmetro cursoId é obrigatório.' });
  }

  try {
    const result = await db.query(`
      SELECT u.id, u.nome, u.email
      FROM usuarios u
      JOIN matriculas m ON m.usuario_id = u.id
      WHERE m.curso_id = $1 AND m.status = 'ativo' AND u.role = 'aluno'
    `, [cursoId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar alunos do curso:', err);
    res.status(500).json({ error: 'Erro ao buscar alunos do curso.' });
  }
});

// Listar alunos de um curso específico
app.get('/api/cursos/:id/alunos', authenticateToken, authorizeAdmin, async (req, res) => {
  const cursoId = req.params.id;

  try {
    const resultado = await db.query(
      `SELECT u.nome, u.email, m.status 
       FROM matriculas m
       JOIN usuarios u ON m.usuario_id = u.id
       WHERE m.curso_id = $1`,
      [cursoId]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Erro ao listar alunos:', error);
    res.status(500).json({ error: 'Erro interno ao buscar alunos.' });
  }
});

// Rotas de Notícias
app.get('/api/noticias', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM noticias ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar notícias:', err);
    res.status(500).json({ error: 'Erro ao buscar notícias.' });
  }
});

app.post('/api/noticias', authenticateToken, authorizeAdmin, async (req, res) => {
  const { title, conteudo, categoria, link, status } = req.body;
  if (!title || !conteudo || !categoria) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO noticias (title, conteudo, categoria, link, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, conteudo, categoria, link || '', status || 'Publicado']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar notícia:', err);
    res.status(500).json({ error: 'Erro ao criar notícia.' });
  }
});

app.put('/api/noticias/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, conteudo, categoria, link, status } = req.body;
  if (!title || !conteudo || !categoria) {
    return res.status(400).json({ error: 'Campos obrigatórios não preenchidos.' });
  }

  try {
    const result = await db.query(
      'UPDATE noticias SET title = $1, conteudo = $2, categoria = $3, link = $4, status = $5 WHERE id = $6 RETURNING *',
      [title, conteudo, categoria, link, status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notícia não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar notícia:', err);
    res.status(500).json({ error: 'Erro ao atualizar notícia.' });
  }
});

app.delete('/api/noticias/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query('DELETE FROM noticias WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notícia não encontrada.' });
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar notícia:', err);
    res.status(500).json({ error: 'Erro ao deletar notícia.' });
  }
});

// Rotas de Usuários
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  console.log(`Requisição recebida em /api/users/${req.params.id}:`, req.body);
  const { id } = req.params;
  const { nome, senhaAtual, novaSenha } = req.body;

  if (parseInt(id) !== req.user.id) {
    return res.status(403).json({ error: 'Você só pode editar seus próprios dados.' });
  }

  if (!nome && !novaSenha) {
    return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
  }

  try {
    // Se for alterar a senha, verificar a atual
    if (novaSenha) {
      const result = await db.query('SELECT senha FROM usuarios WHERE id = $1', [id]);
      const senhaHash = result.rows[0].senha;
      const senhaValida = await bcrypt.compare(senhaAtual, senhaHash);
      if (!senhaValida) {
        console.log('Senha atual inválida para usuário:', req.user.email);
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      }

      const novaHash = await bcrypt.hash(novaSenha, 10);
      await db.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [novaHash, id]);
      console.log('Senha atualizada com sucesso');
    }

    if (nome) {
      await db.query('UPDATE usuarios SET nome = $1 WHERE id = $2', [nome, id]);
      console.log('Nome atualizado para:', nome);
    }

    console.log('Dados atualizados com sucesso para usuário:', id);
    res.json({ message: 'Dados atualizados com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
