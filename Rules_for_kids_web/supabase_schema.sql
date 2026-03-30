-- ============================================================
-- SCRIPT SQL PARA SUPABASE - App de Tareas Infantiles
-- Pega este código en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- 1. TABLA: perfiles_hijos
CREATE TABLE public.perfiles_hijos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  puntos_acumulados INTEGER DEFAULT 0,
  avatar TEXT DEFAULT '🧒',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLA: tareas_config
CREATE TABLE public.tareas_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_tarea TEXT NOT NULL,
  icono TEXT DEFAULT '⭐',
  puntos_valor INTEGER DEFAULT 10,
  hijo_id UUID NOT NULL REFERENCES public.perfiles_hijos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA: registro_diario
CREATE TABLE public.registro_diario (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tarea_id UUID NOT NULL REFERENCES public.tareas_config(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  completado BOOLEAN DEFAULT NULL, -- NULL = sin marcar, TRUE = carita feliz, FALSE = carita triste
  hijo_id UUID NOT NULL REFERENCES public.perfiles_hijos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tarea_id, fecha) -- evita duplicados por tarea/día
);

-- 4. TABLA: recompensas
CREATE TABLE public.recompensas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_premio TEXT NOT NULL,
  puntos_necesarios INTEGER NOT NULL,
  icono TEXT DEFAULT '🎁',
  canjeado BOOLEAN DEFAULT FALSE,
  hijo_id UUID NOT NULL REFERENCES public.perfiles_hijos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.perfiles_hijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recompensas ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS: perfiles_hijos
CREATE POLICY "Usuario ve sus propios hijos" ON public.perfiles_hijos
  FOR ALL USING (auth.uid() = user_id);

-- POLÍTICAS: tareas_config
CREATE POLICY "Usuario ve sus propias tareas" ON public.tareas_config
  FOR ALL USING (auth.uid() = user_id);

-- POLÍTICAS: registro_diario (acceso vía hijo_id del usuario)
CREATE POLICY "Usuario ve sus registros diarios" ON public.registro_diario
  FOR ALL USING (
    hijo_id IN (
      SELECT id FROM public.perfiles_hijos WHERE user_id = auth.uid()
    )
  );

-- POLÍTICAS: recompensas
CREATE POLICY "Usuario ve sus recompensas" ON public.recompensas
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- DATOS DE EJEMPLO (opcional, comenta si no los quieres)
-- ============================================================
-- Estos se insertarán al iniciar sesión por primera vez
-- La app los crea automáticamente desde el frontend
