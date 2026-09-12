ALTER TABLE snapshots
  ADD COLUMN id_publico UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN estado TEXT NOT NULL DEFAULT 'aguardando',
  ADD COLUMN etapa TEXT,
  ADD COLUMN tentativa INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN tentativa_iniciada_em TIMESTAMPTZ,
  ADD COLUMN ultima_atividade_em TIMESTAMPTZ,
  ADD COLUMN atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN finalizado_em TIMESTAMPTZ,
  ADD COLUMN lease_id UUID,
  ADD COLUMN lease_expira_em TIMESTAMPTZ,
  ADD COLUMN erro_codigo TEXT,
  ADD COLUMN erro_categoria TEXT,
  ADD COLUMN erro_mensagem TEXT,
  ADD COLUMN erro_detalhes JSONB,
  ADD COLUMN erro_em TIMESTAMPTZ;

ALTER TABLE snapshots
  ADD CONSTRAINT snapshots_id_publico_unico UNIQUE (id_publico),
  ADD CONSTRAINT snapshots_estado_valido CHECK (
    estado IN ('aguardando', 'processando', 'concluido', 'falha')
  ),
  ADD CONSTRAINT snapshots_etapa_valida CHECK (
    etapa IS NULL OR etapa IN (
      'preparacao',
      'obtencao_arquivos',
      'indexacao',
      'persistencia'
    )
  ),
  ADD CONSTRAINT snapshots_tentativa_valida CHECK (tentativa >= 1),
  ADD CONSTRAINT snapshots_lease_coerente CHECK (
    (estado = 'processando' AND lease_id IS NOT NULL AND lease_expira_em IS NOT NULL)
    OR (estado <> 'processando' AND lease_id IS NULL AND lease_expira_em IS NULL)
  ),
  ADD CONSTRAINT snapshots_erro_coerente CHECK (
    (
      estado = 'falha'
      AND erro_codigo IS NOT NULL
      AND erro_categoria IS NOT NULL
      AND erro_mensagem IS NOT NULL
      AND erro_em IS NOT NULL
    )
    OR (
      estado <> 'falha'
      AND erro_codigo IS NULL
      AND erro_categoria IS NULL
      AND erro_mensagem IS NULL
      AND erro_detalhes IS NULL
      AND erro_em IS NULL
    )
  ),
  ADD CONSTRAINT snapshots_erro_categoria_valida CHECK (
    erro_categoria IS NULL OR erro_categoria IN ('transitoria', 'deterministica')
  );
