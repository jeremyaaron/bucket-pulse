import { ScheduledEvent } from "aws-lambda";
import { DefaultAggregationService } from "../core/aggregation-service";
import {
  alertRepo,
  prefixConfigRepo,
  prefixStatusRepo,
  prefixEvalRepo,
  bucketRepo,
  athenaRunner,
  sqlBuilderConfig,
} from "../core/bootstrap";

const aggregationService = new DefaultAggregationService({
  prefixConfigRepo,
  prefixStatusRepo,
  alertRepo,
  evaluationRepo: prefixEvalRepo,
  bucketRepo,
  athena: athenaRunner,
  sqlBuilderConfig,
  journalWindowMinutes: 60,
});

export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log("Aggregator triggered at", event.time);
  await aggregationService.runAggregationCycle();
};
