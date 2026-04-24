// ===========================================
// Onboarding progress bar
// ===========================================

const STEPS = [
  { key: "line_oa", label: "เชื่อม LINE", shortLabel: "LINE" },
  { key: "google", label: "เชื่อม Google", shortLabel: "Google" },
  { key: "company", label: "ตั้งค่าบริษัท", shortLabel: "บริษัท" },
  { key: "done", label: "เสร็จสิ้น", shortLabel: "เริ่มใช้" },
] as const;

const STEP_ORDER = ["line_login", "line_oa", "google", "company", "done"];

function getStepStatus(
  stepKey: string,
  currentStep: string
): "completed" | "active" | "pending" {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const stepIndex = STEP_ORDER.indexOf(stepKey);

  if (currentIndex < 0 || stepIndex < 0) return "pending";
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export function OnboardingProgress({
  currentStep,
}: {
  currentStep: string;
}) {
  return (
    <nav aria-label="Onboarding progress">
      <ol className="onb-progress">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key, currentStep);
          const isLast = idx === STEPS.length - 1;

          return (
            <li key={step.key} className="onb-progress-item">
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  gap: "0.5rem",
                  minWidth: 0,
                }}
              >
                <div className={`onb-progress-circle ${status}`}>
                  {status === "completed" ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span className={`onb-progress-label ${status}`}>
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className={`onb-progress-connector ${status === "completed" ? "completed" : ""}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
