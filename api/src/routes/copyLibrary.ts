import { Router } from 'express';
import { pool } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();

// 获取文案库列表
router.get('/', authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await pool.query(
      `SELECT id, name, buwei, changping, donzuojiexi, created_at, updated_at 
       FROM copy_library 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );
    // 解析 JSON 字段
    const data = result.rows.map((row) => ({
      ...row,
      buwei: typeof row.buwei === 'string' ? JSON.parse(row.buwei) : row.buwei,
      donzuojiexi: typeof row.donzuojiexi === 'string' ? JSON.parse(row.donzuojiexi) : row.donzuojiexi,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get copy library failed:', error);
    res.status(500).json({ success: false, error: 'Failed to get copy library' });
  }
});

// 获取单个文案详情
router.get('/:id', authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM copy_library WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Copy not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get copy detail failed:', error);
    res.status(500).json({ success: false, error: 'Failed to get copy detail' });
  }
});

// 创建文案
router.post('/', authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const {
      name,
      buwei,
      changping,
      donzuojiexi,
      erchuanwenan,
      wenan_array_string,
      wenan_fenxi,
      translated_lines,
      tts_individual,
      tts_merged,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO copy_library (
        user_id, name, buwei, changping, donzuojiexi, erchuanwenan,
        wenan_array_string, wenan_fenxi, translated_lines,
        tts_individual, tts_merged
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        userId,
        name,
        JSON.stringify(buwei || []),
        changping,
        JSON.stringify(donzuojiexi || []),
        erchuanwenan,
        JSON.stringify(wenan_array_string || []),
        wenan_fenxi,
        JSON.stringify(translated_lines || []),
        JSON.stringify(tts_individual || []),
        JSON.stringify(tts_merged || {}),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create copy failed:', error);
    res.status(500).json({ success: false, error: 'Failed to create copy' });
  }
});

// 更新文案
router.put('/:id', authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const {
      name,
      buwei,
      changping,
      donzuojiexi,
      erchuanwenan,
      wenan_array_string,
      wenan_fenxi,
      translated_lines,
      tts_individual,
      tts_merged,
    } = req.body;

    const result = await pool.query(
      `UPDATE copy_library SET
        name = $1,
        buwei = $2,
        changping = $3,
        donzuojiexi = $4,
        erchuanwenan = $5,
        wenan_array_string = $6,
        wenan_fenxi = $7,
        translated_lines = $8,
        tts_individual = $9,
        tts_merged = $10,
        updated_at = now()
      WHERE id = $11 AND user_id = $12
      RETURNING *`,
      [
        name,
        JSON.stringify(buwei || []),
        changping,
        JSON.stringify(donzuojiexi || []),
        erchuanwenan,
        JSON.stringify(wenan_array_string || []),
        wenan_fenxi,
        JSON.stringify(translated_lines || []),
        JSON.stringify(tts_individual || []),
        JSON.stringify(tts_merged || {}),
        id,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Copy not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update copy failed:', error);
    res.status(500).json({ success: false, error: 'Failed to update copy' });
  }
});

// 删除文案
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM copy_library WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Copy not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete copy failed:', error);
    res.status(500).json({ success: false, error: 'Failed to delete copy' });
  }
});

export default router;
