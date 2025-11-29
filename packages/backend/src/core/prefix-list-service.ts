import { GetBucketPrefixesResponse } from "@bucket-pulse/shared/dist/bucket-pulse-api";
import { BucketRepository, PrefixConfigRepository, PrefixStatusRepository } from "./repositories";

export class PrefixListService {
  constructor(
    private readonly bucketRepo: BucketRepository,
    private readonly prefixConfigRepo: PrefixConfigRepository,
    private readonly prefixStatusRepo: PrefixStatusRepository,
  ) {}

  async getBucketPrefixes(bucketName: string): Promise<GetBucketPrefixesResponse | null> {
    const bucket = await this.bucketRepo.getBucket(bucketName);
    if (!bucket) return null;

    const configs = await this.prefixConfigRepo.listByBucket(bucketName);
    const statuses = await this.prefixStatusRepo.listByBucket(bucketName);
    const statusMap = new Map(statuses.map((s) => [`${s.bucketName}::${s.prefix}`, s]));

    const prefixes = configs.map((config) => ({
      config,
      status: statusMap.get(`${config.bucketName}::${config.prefix}`),
    }));

    return { bucket, prefixes };
  }
}
