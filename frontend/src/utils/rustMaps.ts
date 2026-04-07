export interface VoteOptionRustMapsFields {
  description: string | null | undefined;
  map_seed: number | null | undefined;
  map_size: number | null | undefined;
}

/** Как в MapVote и rustmapsApi: URL из описания или seed/size. */
export function rustMapsUrlFromVoteOption(opt: VoteOptionRustMapsFields): string | null {
  const desc = opt.description?.trim();
  if (desc?.startsWith('http')) return desc;
  if (opt.map_seed != null && opt.map_size != null) {
    return `https://rustmaps.com/map/${opt.map_size}_${opt.map_seed}`;
  }
  return null;
}
