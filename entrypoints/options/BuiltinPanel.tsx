import { useCallback, useEffect, useState } from 'react';
import { builtinStatus, toBuiltinLang, type BuiltinStatus } from '@/lib/builtin/translator';
import { languageLabel } from '@/lib/languages';
import { useI18n } from '@/lib/i18n/react';
import { Button } from './components';

/**
 * Shows whether Chrome's on-device translator can handle English → target,
 * and lets the user download the model up front. Downloading needs a click,
 * which is why it lives here and not only behind the first translation.
 */
export function BuiltinPanel({ targetLang }: { targetLang: string }) {
  const { t, tx } = useI18n();
  const [status, setStatus] = useState<BuiltinStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // Translating into English would make the probe English → English.
  const source = toBuiltinLang(targetLang) === 'en' ? 'es' : 'en';

  const refresh = useCallback(() => {
    void builtinStatus(targetLang, source).then(setStatus);
  }, [targetLang, source]);

  useEffect(refresh, [refresh]);

  const download = () => {
    if (typeof Translator === 'undefined') return;
    setProgress(0);
    Translator.create({
      sourceLanguage: toBuiltinLang(source),
      targetLanguage: toBuiltinLang(targetLang),
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => setProgress(e.loaded));
      },
    })
      .then((tr) => tr.destroy())
      .catch(() => undefined)
      .finally(() => {
        setProgress(null);
        refresh();
      });
  };

  const tone =
    status === 'available' ? 'text-emerald-700'
    : status === 'unsupported' || status === 'unavailable' ? 'text-red-700'
    : 'text-amber-700';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs leading-relaxed text-slate-600">{t('builtin.hint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-700" aria-live="polite">
          {tx('builtin.status', {
            from: languageLabel(source),
            to: languageLabel(targetLang),
            status: status ? <strong className={tone}>{t(`builtin.status.${status}`)}</strong> : '…',
          })}
        </span>
        {(status === 'downloadable' || status === 'downloading' || progress !== null) && (
          <Button onClick={download} disabled={progress !== null}>
            {progress !== null
              ? t('builtin.downloading', { percent: Math.round(progress * 100) })
              : t('builtin.download')}
          </Button>
        )}
      </div>
    </div>
  );
}
