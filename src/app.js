import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { col } from './db/mongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', routes);

app.get('/report', async (req, res, next) => {
  try {
    const report = await col('reports').findOne({}, { sort: { generated_at: -1 } });
    if (!report) return res.status(404).send('<h1>No reports generated yet</h1>');
    res.type('html').send(report.report_html);
  } catch (err) {
    next(err);
  }
});

app.get('/report/:id', async (req, res, next) => {
  try {
    const { ObjectId } = await import('mongodb');
    const report = await col('reports').findOne({ _id: new ObjectId(req.params.id) });
    if (!report) return res.status(404).send('<h1>Report not found</h1>');
    res.type('html').send(report.report_html);
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

export default app;
