// ===========================================
// Aim Expense — Root tRPC Router
// ===========================================

import { router } from "../trpc";
import { eventRouter } from "./event.router";
import { paymentRouter } from "./payment.router";
import { orgRouter } from "./org.router";
import { payeeRouter } from "./payee.router";
import { bankRouter } from "./bank.router";
import { companyBankRouter } from "./company-bank.router";
import { subscriptionRouter } from "./subscription.router";
import { userRouter } from "./user.router";
import { eventAssignmentRouter } from "./event-assignment.router";
import { reportRouter } from "./report.router";
import { customerRouter } from "./customer.router";
import { quotationRouter } from "./quotation.router";
import { billingRouter } from "./billing.router";

export const appRouter = router({
  event: eventRouter,
  payment: paymentRouter,
  org: orgRouter,
  payee: payeeRouter,
  bank: bankRouter,
  companyBank: companyBankRouter,
  subscription: subscriptionRouter,
  user: userRouter,
  eventAssignment: eventAssignmentRouter,
  report: reportRouter,
  customer: customerRouter,
  quotation: quotationRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
