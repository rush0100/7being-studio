const LINKEDIN = "https://www.linkedin.com/in/ratchaphon/";

type Props = {
  compact?: boolean;
};

/** Collaboration credit — shown beside brand on wide screens. */
export function CollabCredit({ compact = false }: Props) {
  return (
    <p className={`sb-collab ${compact ? "compact" : ""}`}>
      <span className="sb-collab-line">
        <a href="https://rush0100.com/#th" target="_blank" rel="noopener noreferrer">
          <span className="sb-collab-org">RUSH0100</span>
        </a>
        <span className="sb-collab-x" aria-hidden>
          {" "}
          ×{" "}
        </span>
        <span className="sb-collab-org">BURNLab KMITL</span>
      </span>
      <span className="sb-collab-detail">
        <a href={LINKEDIN} target="_blank" rel="noopener noreferrer">
          Ratchaphon Khaemphukhiao
        </a>
        {" · "}
        Thailand BME Lab
      </span>
    </p>
  );
}
