import { PrefixHealthService } from "./repositories";
import {
  BucketRepository,
  PrefixConfigRepository,
  PrefixStatusRepository,
  PrefixEvaluationRepository,
} from "./repositories";

export class DefaultPrefixHealthService implements PrefixHealthService {
  constructor(
    private readonly bucketRepo: BucketRepository,
    private readonly prefixConfigRepo: PrefixConfigRepository,
    private readonly prefixStatusRepo: PrefixStatusRepository,
    private readonly prefixEvalRepo: PrefixEvaluationRepository,
  ) {}

  async getPrefixHealth(params: { bucketName: string; prefix: string; evaluationsLimit?: number; nextToken?: string }) {
    const bucket = await this.bucketRepo.getBucket(params.bucketName);
    if (!bucket) return null;

    const config = await this.prefixConfigRepo.get(params.bucketName, params.prefix);
    if (!config) return null;

    const status = await this.prefixStatusRepo.get(params.bucketName, params.prefix);
    const history = await this.prefixEvalRepo.listByPrefix(params.bucketName, params.prefix, {
      limit: params.evaluationsLimit,
      nextToken: params.nextToken,
    });

    return {
      bucket,
      config,
      status: status ?? undefined,
      evaluations: history.items,
      nextToken: history.nextToken,
    };
  }
}
