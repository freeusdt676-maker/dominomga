CREATE OR REPLACE FUNCTION public.domino_guard_board_dupes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  dup_count int;
BEGIN
  IF NEW.board_state IS NULL OR jsonb_typeof(NEW.board_state) <> 'array' THEN
    RETURN NEW;
  END IF;
  IF OLD.board_state IS NOT DISTINCT FROM NEW.board_state THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO dup_count FROM (
    SELECT least((e->'tile'->>0)::int, (e->'tile'->>1)::int) || '-' ||
           greatest((e->'tile'->>0)::int, (e->'tile'->>1)::int) AS k
    FROM jsonb_array_elements(NEW.board_state) e
    WHERE e ? 'tile'
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'domino_duplicate_tile_on_board';
  END IF;

  RETURN NEW;
END;
$$;