import { cardVariants } from '@carbonid1/design-system'

const LINK_CLASSES = 'text-primary hover:underline'

export const CreditsCard = () => (
  <section className={cardVariants({ className: 'p-5' })}>
    <h2 className="mb-3 text-base font-semibold">Voice Credits</h2>
    <div className="text-muted-foreground space-y-3 text-xs leading-relaxed">
      <p>
        Bundled voice references derived from the Hi-Fi Multi-Speaker English TTS Dataset
        (Bakhturina et al., 2021), available at{' '}
        <a
          href="http://openslr.org/109/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASSES}
        >
          openslr.org/109
        </a>
        . Licensed under{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASSES}
        >
          CC BY 4.0
        </a>
        . Audio clips were trimmed and processed for use as TTS voice references.
      </p>
      <p>
        <a
          href="https://keithito.com/LJ-Speech-Dataset/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASSES}
        >
          LJ Speech Dataset
        </a>{' '}
        by Keith Ito.
      </p>
    </div>
  </section>
)
