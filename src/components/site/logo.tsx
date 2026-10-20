// โลโก้ Aim Expense — แก้ที่เดียว ทุกหน้าสาธารณะตามไปเอง (ไฟล์ public/aim-expense-logo.png, พื้นน้ำเงินในตัว)
export function Logo({
  className = "h-8 w-8",
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/aim-expense-logo.png"
      alt="Aim Expense"
      width={512}
      height={512}
      className={`${className} ${rounded} shrink-0 object-contain`}
    />
  );
}
