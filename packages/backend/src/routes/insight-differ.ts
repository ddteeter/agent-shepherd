import type {
  InsightCategories,
  InsightItem,
  RecurringPatternItem,
  ToolRecommendationItem,
} from '@agent-shepherd/shared';

function prIdsChanged(incoming: string[], existing: string[]): boolean {
  if (incoming.length !== existing.length) return true;
  const incomingSet = new Set(incoming);
  return existing.some((id) => !incomingSet.has(id));
}

function insightItemChanged(
  incoming: InsightItem,
  existing: InsightItem,
): boolean {
  return (
    incoming.description !== existing.description ||
    incoming.confidence !== existing.confidence ||
    incoming.appliedPath !== existing.appliedPath
  );
}

function recurringPatternChanged(
  incoming: RecurringPatternItem,
  existing: RecurringPatternItem,
): boolean {
  return (
    incoming.description !== existing.description ||
    incoming.confidence !== existing.confidence ||
    prIdsChanged(incoming.prIds, existing.prIds)
  );
}

function toolRecommendationChanged(
  incoming: ToolRecommendationItem,
  existing: ToolRecommendationItem,
): boolean {
  return (
    incoming.description !== existing.description ||
    incoming.confidence !== existing.confidence ||
    incoming.implementationPrompt !== existing.implementationPrompt
  );
}

function resolveLastUpdatedAt(
  changed: boolean,
  existingLastUpdatedAt: string | undefined,
  now: string,
): string | undefined {
  if (changed) return now;
  return existingLastUpdatedAt;
}

function diffInsightItems(
  incoming: InsightItem[],
  existing: InsightItem[],
  now: string,
): InsightItem[] {
  const availableExisting = new Map<string, InsightItem>();
  for (const item of existing) {
    if (!availableExisting.has(item.title)) {
      availableExisting.set(item.title, item);
    }
  }

  const usedTitles = new Set<string>();

  return incoming.map((incomingItem): InsightItem => {
    const existingItem = availableExisting.get(incomingItem.title);
    const alreadyUsed = usedTitles.has(incomingItem.title);

    if (existingItem && !alreadyUsed) {
      usedTitles.add(incomingItem.title);
      const changed = insightItemChanged(incomingItem, existingItem);
      const lastUpdatedAt = resolveLastUpdatedAt(
        changed,
        existingItem.lastUpdatedAt,
        now,
      );
      return {
        title: incomingItem.title,
        description: incomingItem.description,
        confidence: incomingItem.confidence,
        ...(incomingItem.appliedPath === undefined
          ? {}
          : { appliedPath: incomingItem.appliedPath }),
        firstSeenAt: existingItem.firstSeenAt,
        ...(lastUpdatedAt === undefined ? {} : { lastUpdatedAt }),
      };
    }

    return {
      title: incomingItem.title,
      description: incomingItem.description,
      confidence: incomingItem.confidence,
      ...(incomingItem.appliedPath === undefined
        ? {}
        : { appliedPath: incomingItem.appliedPath }),
      firstSeenAt: now,
    };
  });
}

function diffRecurringPatterns(
  incoming: RecurringPatternItem[],
  existing: RecurringPatternItem[],
  now: string,
): RecurringPatternItem[] {
  const availableExisting = new Map<string, RecurringPatternItem>();
  for (const item of existing) {
    if (!availableExisting.has(item.title)) {
      availableExisting.set(item.title, item);
    }
  }

  const usedTitles = new Set<string>();

  return incoming.map((incomingItem): RecurringPatternItem => {
    const existingItem = availableExisting.get(incomingItem.title);
    const alreadyUsed = usedTitles.has(incomingItem.title);

    if (existingItem && !alreadyUsed) {
      usedTitles.add(incomingItem.title);
      const changed = recurringPatternChanged(incomingItem, existingItem);
      const lastUpdatedAt = resolveLastUpdatedAt(
        changed,
        existingItem.lastUpdatedAt,
        now,
      );
      return {
        title: incomingItem.title,
        description: incomingItem.description,
        confidence: incomingItem.confidence,
        prIds: incomingItem.prIds,
        firstSeenAt: existingItem.firstSeenAt,
        ...(lastUpdatedAt === undefined ? {} : { lastUpdatedAt }),
      };
    }

    return {
      title: incomingItem.title,
      description: incomingItem.description,
      confidence: incomingItem.confidence,
      prIds: incomingItem.prIds,
      firstSeenAt: now,
    };
  });
}

function diffToolRecommendations(
  incoming: ToolRecommendationItem[],
  existing: ToolRecommendationItem[],
  now: string,
): ToolRecommendationItem[] {
  const availableExisting = new Map<string, ToolRecommendationItem>();
  for (const item of existing) {
    if (!availableExisting.has(item.title)) {
      availableExisting.set(item.title, item);
    }
  }

  const usedTitles = new Set<string>();

  return incoming.map((incomingItem): ToolRecommendationItem => {
    const existingItem = availableExisting.get(incomingItem.title);
    const alreadyUsed = usedTitles.has(incomingItem.title);

    if (existingItem && !alreadyUsed) {
      usedTitles.add(incomingItem.title);
      const changed = toolRecommendationChanged(incomingItem, existingItem);
      const lastUpdatedAt = resolveLastUpdatedAt(
        changed,
        existingItem.lastUpdatedAt,
        now,
      );
      return {
        title: incomingItem.title,
        description: incomingItem.description,
        confidence: incomingItem.confidence,
        implementationPrompt: incomingItem.implementationPrompt,
        firstSeenAt: existingItem.firstSeenAt,
        ...(lastUpdatedAt === undefined ? {} : { lastUpdatedAt }),
      };
    }

    return {
      title: incomingItem.title,
      description: incomingItem.description,
      confidence: incomingItem.confidence,
      implementationPrompt: incomingItem.implementationPrompt,
      firstSeenAt: now,
    };
  });
}

export function diffInsightCategories(
  incoming: InsightCategories,
  existing: InsightCategories | undefined,
): InsightCategories {
  const now = new Date().toISOString();
  const ex = existing ?? {
    toolRecommendations: [],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };

  return {
    toolRecommendations: diffToolRecommendations(
      incoming.toolRecommendations,
      ex.toolRecommendations,
      now,
    ),
    claudeMdRecommendations: diffInsightItems(
      incoming.claudeMdRecommendations,
      ex.claudeMdRecommendations,
      now,
    ),
    skillRecommendations: diffInsightItems(
      incoming.skillRecommendations,
      ex.skillRecommendations,
      now,
    ),
    promptEngineering: diffInsightItems(
      incoming.promptEngineering,
      ex.promptEngineering,
      now,
    ),
    agentBehaviorObservations: diffInsightItems(
      incoming.agentBehaviorObservations,
      ex.agentBehaviorObservations,
      now,
    ),
    recurringPatterns: diffRecurringPatterns(
      incoming.recurringPatterns,
      ex.recurringPatterns,
      now,
    ),
  };
}
