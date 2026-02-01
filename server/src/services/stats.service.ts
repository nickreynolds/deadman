// Stats service - aggregates system-wide statistics for admin dashboard

import { prisma } from '../db';

interface RecentVideo {
  id: string;
  title: string;
  username: string;
  file_size_bytes: string;
  status: string;
  created_at: string;
}

interface RecentDistribution {
  id: string;
  title: string;
  username: string;
  distributed_at: string;
}

export interface SystemStats {
  total_users: number;
  total_videos: number;
  active_videos: number;
  distributed_videos: number;
  pending_videos: number;
  expired_videos: number;
  total_storage_used_bytes: string;
  total_storage_quota_bytes: string;
  recent_uploads: RecentVideo[];
  recent_distributions: RecentDistribution[];
}

/**
 * Get aggregated system statistics
 */
export async function getSystemStats(): Promise<SystemStats> {
  const [
    totalUsers,
    totalVideos,
    activeVideos,
    distributedVideos,
    pendingVideos,
    expiredVideos,
    storageAgg,
    recentUploads,
    recentDistributions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.video.count(),
    prisma.video.count({ where: { status: 'ACTIVE' } }),
    prisma.video.count({ where: { status: 'DISTRIBUTED' } }),
    prisma.video.count({ where: { status: 'PENDING' } }),
    prisma.video.count({ where: { status: 'EXPIRED' } }),
    prisma.user.aggregate({
      _sum: {
        storageUsedBytes: true,
        storageQuotaBytes: true,
      },
    }),
    prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { username: true } } },
    }),
    prisma.video.findMany({
      where: { status: 'DISTRIBUTED', distributedAt: { not: null } },
      orderBy: { distributedAt: 'desc' },
      take: 5,
      include: { user: { select: { username: true } } },
    }),
  ]);

  return {
    total_users: totalUsers,
    total_videos: totalVideos,
    active_videos: activeVideos,
    distributed_videos: distributedVideos,
    pending_videos: pendingVideos,
    expired_videos: expiredVideos,
    total_storage_used_bytes: (storageAgg._sum.storageUsedBytes ?? BigInt(0)).toString(),
    total_storage_quota_bytes: (storageAgg._sum.storageQuotaBytes ?? BigInt(0)).toString(),
    recent_uploads: recentUploads.map((v: { id: string; title: string; user: { username: string }; fileSizeBytes: bigint; status: string; createdAt: Date }) => ({
      id: v.id,
      title: v.title,
      username: v.user.username,
      file_size_bytes: v.fileSizeBytes.toString(),
      status: v.status,
      created_at: v.createdAt.toISOString(),
    })),
    recent_distributions: recentDistributions.map((v: { id: string; title: string; user: { username: string }; distributedAt: Date | null }) => ({
      id: v.id,
      title: v.title,
      username: v.user.username,
      distributed_at: v.distributedAt!.toISOString(),
    })),
  };
}
