import { Router } from 'express';
import healthRouter from './health.js';
import reportsRouter from './reports.js';
import entitiesRouter from './entities.js';
import adminRouter from './admin.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/reports', reportsRouter);
router.use('/entities', entitiesRouter);
router.use('/admin', adminRouter);

export default router;
