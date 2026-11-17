const PERIODS_BY_LEVEL = Object.freeze({ primaire: 6, secondaire: 4 });

function normalizeGradeLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PERIODS_BY_LEVEL, level) ? level : "";
}

function normalizeGradePeriod(value, level) {
  const period = Number(value);
  return Number.isInteger(period) && period >= 1 && period <= PERIODS_BY_LEVEL[level]
    ? period
    : null;
}

function gradeScoreStatus(score) {
  if (score == null || !Number.isFinite(Number(score))) return "missing";
  return Number(score) < 50 ? "failed" : "passed";
}

function summarizeGrades(rows) {
  const enteredRows = rows.filter((row) => row.score != null && Number.isFinite(Number(row.score)));
  const scores = enteredRows.map((row) => Number(row.score));
  const failed = scores.filter((score) => score < 50).length;
  const passed = scores.length - failed;
  return {
    totalStudents: rows.length,
    entered: scores.length,
    missing: rows.length - scores.length,
    average: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : null,
    passed,
    failed,
    passRate: scores.length ? Number(((passed / scores.length) * 100).toFixed(1)) : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null
  };
}

function registerGradesRoutes(app, deps) {
  const {
    requireRole,
    all,
    get,
    pgPool,
    writeAudit,
    getSchoolYearStartYearSetting
  } = deps;

  function normalizeLevel(value) {
    return normalizeGradeLevel(value);
  }

  function normalizeYear(value) {
    const year = Number(value);
    return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
  }

  function normalizePeriod(value, level) {
    return normalizeGradePeriod(value, level);
  }

  function scoreStatus(score) {
    return gradeScoreStatus(score);
  }

  function summarize(rows) {
    return summarizeGrades(rows);
  }

  app.get("/api/students/:id/grades", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    try {
      const studentId = String(req.params.id || "").trim();
      const student = await get(
        `SELECT id, COALESCE(NULLIF(matricule, ''), id) AS matricule, "fullName", level, "className",
                "schoolYearStartYear", "isActive"
         FROM students WHERE id = ?`,
        [studentId]
      );
      if (!student) return res.status(404).json({ error: "Élève introuvable" });
      const level = normalizeLevel(student.level);
      if (!level) {
        return res.json({
          studentId,
          level: student.level,
          maxPeriods: 0,
          schoolYearStartYear: Number(student.schoolYearStartYear),
          schoolYearLabel: `${student.schoolYearStartYear}-${Number(student.schoolYearStartYear) + 1}`,
          periodScores: [],
          summary: { entered: 0, missing: 0, average: null, failed: 0, passed: 0, latestScore: null, latestPeriod: null },
          trend: { direction: "stable", delta: null },
          classRank: null,
          rankedStudents: 0
        });
      }
      const year = Number(student.schoolYearStartYear);
      const gradeRows = await all(
        `SELECT period, score, "updatedAt" FROM student_grades
         WHERE "studentId" = ? AND "schoolYearStartYear" = ?
         ORDER BY period ASC`,
        [studentId, year]
      );
      const byPeriod = new Map(gradeRows.map((row) => [Number(row.period), Number(row.score)]));
      const periodScores = Array.from({ length: PERIODS_BY_LEVEL[level] }, (_, index) => {
        const period = index + 1;
        const score = byPeriod.has(period) ? byPeriod.get(period) : null;
        return { period, score, status: gradeScoreStatus(score) };
      });
      const entered = periodScores.filter((item) => item.score != null);
      const scores = entered.map((item) => Number(item.score));
      const failed = scores.filter((score) => score < 50).length;
      const latest = entered[entered.length - 1] || null;
      const previous = entered[entered.length - 2] || null;
      const delta = latest && previous ? Number((latest.score - previous.score).toFixed(2)) : null;
      const direction = delta == null || Math.abs(delta) < 5 ? "stable" : delta > 0 ? "improving" : "declining";

      const rankingRows = await all(
        `SELECT s.id AS "studentId", ROUND(AVG(g.score), 2) AS average
         FROM students s
         JOIN student_grades g
           ON g."studentId" = s.id AND g."schoolYearStartYear" = s."schoolYearStartYear"
         WHERE s."schoolYearStartYear" = ? AND s.level = ? AND s."className" = ?
           AND COALESCE(s."isActive", TRUE) = TRUE
         GROUP BY s.id
         ORDER BY AVG(g.score) DESC, s.id ASC`,
        [year, level, student.className]
      );
      const rankIndex = rankingRows.findIndex((row) => String(row.studentId) === studentId);
      res.json({
        studentId,
        level,
        maxPeriods: PERIODS_BY_LEVEL[level],
        schoolYearStartYear: year,
        schoolYearLabel: `${year}-${year + 1}`,
        periodScores,
        summary: {
          entered: entered.length,
          missing: PERIODS_BY_LEVEL[level] - entered.length,
          average: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : null,
          failed,
          passed: scores.length - failed,
          latestScore: latest?.score ?? null,
          latestPeriod: latest?.period ?? null
        },
        trend: { direction, delta },
        classRank: rankIndex >= 0 ? rankIndex + 1 : null,
        rankedStudents: rankingRows.length
      });
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
  });

  app.get("/api/grades", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    try {
      const level = normalizeLevel(req.query.level);
      if (!level) return res.status(400).json({ error: "Le niveau doit être primaire ou secondaire" });
      const configuredYear = normalizeYear(await getSchoolYearStartYearSetting());
      const schoolYearStartYear = normalizeYear(req.query.schoolYearStartYear) || configuredYear;
      const period = normalizePeriod(req.query.period, level);
      if (!schoolYearStartYear || !period) {
        return res.status(400).json({ error: `Période invalide pour le niveau ${level}` });
      }
      const className = String(req.query.className || "").trim();
      const classSql = className ? ` AND s."className" = ?` : "";
      const rows = await all(
        `SELECT s.id AS "studentId", COALESCE(NULLIF(s.matricule, ''), s.id) AS matricule,
                s."fullName", s.level, s."className", g.score,
                g."updatedAt", g."updatedByUsername"
         FROM students s
         LEFT JOIN student_grades g
           ON g."studentId" = s.id
          AND g."schoolYearStartYear" = ?
          AND g.period = ?
         WHERE s."schoolYearStartYear" = ?
           AND s.level = ?
           AND COALESCE(s."isActive", TRUE) = TRUE${classSql}
         ORDER BY s."className" ASC, s."fullName" ASC, s.id ASC`,
        [schoolYearStartYear, period, schoolYearStartYear, level].concat(className ? [className] : [])
      );
      const normalizedRows = rows.map((row) => ({
        ...row,
        score: row.score == null ? null : Number(row.score),
        status: scoreStatus(row.score)
      }));

      const trendParams = [schoolYearStartYear, level];
      let trendClassSql = "";
      if (className) {
        trendClassSql = ` AND s."className" = ?`;
        trendParams.push(className);
      }
      const trendRows = await all(
        `SELECT g.period, COUNT(g.id)::int AS entered,
                ROUND(AVG(g.score), 2) AS average,
                COUNT(*) FILTER (WHERE g.score < 50)::int AS failed,
                COUNT(*) FILTER (WHERE g.score >= 50)::int AS passed
         FROM student_grades g
         JOIN students s ON s.id = g."studentId"
         WHERE g."schoolYearStartYear" = ?
           AND s.level = ?
           AND COALESCE(s."isActive", TRUE) = TRUE${trendClassSql}
         GROUP BY g.period
         ORDER BY g.period ASC`,
        trendParams
      );
      const trendByPeriod = new Map(trendRows.map((row) => [Number(row.period), row]));
      const periodTrend = Array.from({ length: PERIODS_BY_LEVEL[level] }, (_, index) => {
        const row = trendByPeriod.get(index + 1);
        const entered = Number(row?.entered || 0);
        const passed = Number(row?.passed || 0);
        return {
          period: index + 1,
          entered,
          average: row?.average == null ? null : Number(row.average),
          failed: Number(row?.failed || 0),
          passed,
          passRate: entered ? Number(((passed / entered) * 100).toFixed(1)) : null
        };
      });

      const historyParams = [schoolYearStartYear, level];
      let historyClassSql = "";
      if (className) {
        historyClassSql = ` AND s."className" = ?`;
        historyParams.push(className);
      }
      const historyRows = await all(
        `SELECT s.id AS "studentId", COALESCE(NULLIF(s.matricule, ''), s.id) AS matricule,
                s."fullName", s."className", g.period, g.score
         FROM students s
         JOIN student_grades g ON g."studentId" = s.id AND g."schoolYearStartYear" = ?
         WHERE s.level = ? AND COALESCE(s."isActive", TRUE) = TRUE${historyClassSql}
         ORDER BY s.id, g.period`,
        historyParams
      );
      const historyByStudent = new Map();
      for (const row of historyRows) {
        const key = String(row.studentId);
        if (!historyByStudent.has(key)) historyByStudent.set(key, []);
        historyByStudent.get(key).push({ period: Number(row.period), score: Number(row.score) });
      }
      let repeatedFailures = 0;
      let improving = 0;
      let declining = 0;
      for (const history of historyByStudent.values()) {
        if (history.filter((item) => item.score < 50).length >= 2) repeatedFailures += 1;
        if (history.length >= 2) {
          const delta = history[history.length - 1].score - history[history.length - 2].score;
          if (delta >= 5) improving += 1;
          if (delta <= -5) declining += 1;
        }
      }
      const studentProgress = normalizedRows.map((student) => {
        const history = historyByStudent.get(String(student.studentId)) || [];
        const scores = history.map((item) => item.score);
        const failures = scores.filter((score) => score < 50).length;
        const average = scores.length
          ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
          : null;
        const periodScores = Object.fromEntries(history.map((item) => [String(item.period), item.score]));
        let trend = "stable";
        if (scores.length >= 2) {
          const delta = scores[scores.length - 1] - scores[scores.length - 2];
          if (delta >= 5) trend = "improving";
          if (delta <= -5) trend = "declining";
        }
        return {
          studentId: student.studentId,
          matricule: student.matricule,
          fullName: student.fullName,
          className: student.className,
          periodScores,
          enteredPeriods: scores.length,
          average,
          failures,
          trend,
          status: failures >= 2 ? "repeated-failure" : failures === 1 ? "one-failure" : (scores.length ? "satisfactory" : "missing")
        };
      });

      const classRows = await all(
        `SELECT DISTINCT "className"
         FROM students
         WHERE "schoolYearStartYear" = ? AND level = ? AND COALESCE("isActive", TRUE) = TRUE
         ORDER BY "className" ASC`,
        [schoolYearStartYear, level]
      );
      res.json({
        schoolYearStartYear,
        schoolYearLabel: `${schoolYearStartYear}-${schoolYearStartYear + 1}`,
        level,
        period,
        maxPeriods: PERIODS_BY_LEVEL[level],
        className: className || null,
        classes: classRows.map((row) => row.className),
        rows: normalizedRows,
        summary: summarize(normalizedRows),
        periodTrend,
        studentProgress,
        insights: { repeatedFailures, improving, declining }
      });
    } catch (error) {
      res.status(500).json({ error: String(error.message || error) });
    }
  });

  app.put("/api/grades/bulk", requireRole("admin", "comptable", "caissier"), async (req, res) => {
    const client = await pgPool.connect();
    try {
      const level = normalizeLevel(req.body?.level);
      const schoolYearStartYear = normalizeYear(req.body?.schoolYearStartYear);
      const period = level ? normalizePeriod(req.body?.period, level) : null;
      const grades = Array.isArray(req.body?.grades) ? req.body.grades : null;
      if (!level || !schoolYearStartYear || !period || !grades) {
        return res.status(400).json({ error: "Année, niveau, période et notes sont requis" });
      }
      if (grades.length > 500) return res.status(400).json({ error: "Maximum 500 notes par enregistrement" });
      const unique = new Map();
      for (const item of grades) {
        const studentId = String(item?.studentId || "").trim();
        if (!studentId) return res.status(400).json({ error: "Identifiant élève manquant" });
        const empty = item.score == null || String(item.score).trim() === "";
        const score = empty ? null : Number(item.score);
        if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
          return res.status(400).json({ error: `La note de ${studentId} doit être comprise entre 0 et 100` });
        }
        unique.set(studentId, score == null ? null : Number(score.toFixed(2)));
      }
      const studentIds = Array.from(unique.keys());
      if (!studentIds.length) return res.json({ ok: true, saved: 0, deleted: 0 });
      const eligible = await get(
        `SELECT COUNT(*)::int AS count
         FROM students
         WHERE id = ANY(?) AND "schoolYearStartYear" = ? AND level = ? AND COALESCE("isActive", TRUE) = TRUE`,
        [studentIds, schoolYearStartYear, level]
      );
      if (Number(eligible?.count || 0) !== studentIds.length) {
        return res.status(400).json({ error: "Un ou plusieurs élèves ne correspondent pas au niveau ou à l’année sélectionnée" });
      }

      await client.query("BEGIN");
      let saved = 0;
      let deleted = 0;
      for (const [studentId, score] of unique.entries()) {
        if (score == null) {
          const result = await client.query(
            `DELETE FROM student_grades WHERE "studentId" = $1 AND "schoolYearStartYear" = $2 AND period = $3`,
            [studentId, schoolYearStartYear, period]
          );
          deleted += Number(result.rowCount || 0);
          continue;
        }
        await client.query(
          `INSERT INTO student_grades
             ("studentId", "schoolYearStartYear", period, score, "updatedByUserId", "updatedByUsername", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT ("studentId", "schoolYearStartYear", period)
           DO UPDATE SET score = EXCLUDED.score,
                         "updatedByUserId" = EXCLUDED."updatedByUserId",
                         "updatedByUsername" = EXCLUDED."updatedByUsername",
                         "updatedAt" = NOW()`,
          [studentId, schoolYearStartYear, period, score, req.auth?.sub || null, req.auth?.username || null]
        );
        saved += 1;
      }
      await client.query("COMMIT");
      await writeAudit({
        actorId: req.auth?.sub,
        actorUsername: req.auth?.username,
        actorRole: req.auth?.role,
        action: "bulk-save",
        entityType: "student-grade",
        entityId: `${schoolYearStartYear}:${level}:P${period}`,
        details: { level, schoolYearStartYear, period, saved, deleted }
      });
      res.json({ ok: true, saved, deleted });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ error: String(error.message || error) });
    } finally {
      client.release();
    }
  });
}

module.exports = registerGradesRoutes;
module.exports._test = {
  PERIODS_BY_LEVEL,
  normalizeGradeLevel,
  normalizeGradePeriod,
  gradeScoreStatus,
  summarizeGrades
};
