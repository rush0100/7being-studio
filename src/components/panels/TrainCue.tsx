"use client";

type TrainInfo = {
  action: string;
  phase: string;
  trial: number;
  trials_total: number;
  progress: number;
  message: string;
};

const CUE: Record<
  string,
  { th: string; hint: string; motion: string }
> = {
  Push: { th: "ดันไปข้างหน้า", hint: "นึกดันวัตถุตรงหน้า", motion: "push" },
  Pull: { th: "ดึงเข้าหา", hint: "นึกดึงเข้าหาตัว", motion: "pull" },
  Lift: { th: "ยกขึ้น", hint: "นึกยกขึ้นด้านบน", motion: "lift" },
  Drop: { th: "กดลง", hint: "นึกกดลงด้านล่าง", motion: "drop" },
  Left: { th: "ไปซ้าย", hint: "นึกเลื่อนไปทางซ้าย", motion: "left" },
  Right: { th: "ไปขวา", hint: "นึกเลื่อนไปทางขวา", motion: "right" },
  Neutral: { th: "หยุดนิ่ง", hint: "นั่งนิ่ง ว่างใจ ไม่คิดคำสั่ง", motion: "neutral" },
};

export function TrainCue({ train }: { train: TrainInfo }) {
  const meta = CUE[train.action] || {
    th: train.action,
    hint: `คิดตาม ${train.action}`,
    motion: "neutral",
  };
  const cueing = train.phase === "cue";
  const resting = train.phase === "rest";
  const done = train.phase === "done";

  return (
    <div
      className={`sb-train-cue ${cueing ? "cueing" : ""} ${resting ? "resting" : ""} ${done ? "done" : ""}`}
      aria-live="polite"
    >
      <div className="sb-train-cue-stage">
        <div className={`sb-train-orb motion-${meta.motion}`} aria-hidden>
          <span className="sb-train-arrow" />
        </div>
        <div className="sb-train-rings" aria-hidden>
          <span />
          <span />
        </div>
      </div>
      <p className="sb-train-cue-title">
        {done ? "ครบแล้ว" : cueing ? meta.th : "พัก"}
      </p>
      <p className="sb-train-cue-hint">
        {done
          ? "เลือกคำสั่งอื่นแล้วกดเริ่มเก็บข้อมูล — หรือกด Fit เมื่อครบหลายคำสั่ง"
          : cueing
            ? meta.hint
            : "ว่างใจสักครู่ รอรอบถัดไป"}
      </p>
      <div className="sb-train-cue-meta">
        รอบ {train.trial}/{train.trials_total}
        <span className="sb-train-cue-pct">
          {Math.round(train.progress * 100)}%
        </span>
      </div>
      <div className="sb-mental-progress">
        <div
          className="sb-mental-bar"
          style={{ width: `${Math.round(train.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
