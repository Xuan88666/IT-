#!/bin/bash
# ============================================================
# IT 运维百宝箱 - Linux 服务器监控采集脚本
# 免代理，通过 SSH 远程执行即可采集服务器状态
# 用法：ssh user@host "bash -s" < linux-monitor.sh
# 或部署到服务器后直接执行：bash linux-monitor.sh
# 输出：JSON 格式的系统状态快照
# ============================================================
set -e

# ── 采集时间 ──
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname)

# ── CPU ──
# 从 /proc/stat 读 CPU 总时间（user+nice+system+idle+iowait+irq+softirq+steal）
CPU_LINE=$(grep '^cpu ' /proc/stat 2>/dev/null || echo "")
if [ -n "$CPU_LINE" ]; then
    read -r _ USER NICE SYS IDLE IOWAIT IRQ SOFTIRQ STEAL <<< "$CPU_LINE"
    TOTAL_PREV=$((USER + NICE + SYS + IDLE + IOWAIT + IRQ + SOFTIRQ + STEAL))
    IDLE_PREV=$IDLE
    sleep 0.5
    CPU_LINE2=$(grep '^cpu ' /proc/stat)
    read -r _ USER2 NICE2 SYS2 IDLE2 IOWAIT2 IRQ2 SOFTIRQ2 STEAL2 <<< "$CPU_LINE2"
    TOTAL_NOW=$((USER2 + NICE2 + SYS2 + IDLE2 + IOWAIT2 + IRQ2 + SOFTIRQ2 + STEAL2))
    IDLE_NOW=$IDLE2
    TOTAL_DELTA=$((TOTAL_NOW - TOTAL_PREV))
    IDLE_DELTA=$((IDLE_NOW - IDLE_PREV))
    if [ "$TOTAL_DELTA" -gt 0 ]; then
        CPU_USAGE=$(awk "BEGIN { printf \"%.1f\", (1 - $IDLE_DELTA / $TOTAL_DELTA) * 100 }")
    else
        CPU_USAGE=0
    fi
    # CPU 负载均值
    LOAD=$(cat /proc/loadavg 2>/dev/null | awk '{print $1","$2","$3}' || echo "0,0,0")
    # 进程数
    PROCS=$(cat /proc/loadavg 2>/dev/null | awk '{print $4}' | cut -d'/' -f1 || echo "0")
else
    CPU_USAGE=0
    LOAD="0,0,0"
    PROCS=0
fi

# ── 内存 ──
if [ -f /proc/meminfo ]; then
    MEM_TOTAL=$(grep 'MemTotal' /proc/meminfo | awk '{print $2}')
    MEM_AVAIL=$(grep 'MemAvailable' /proc/meminfo | awk '{print $2}')
    MEM_FREE=$(grep 'MemFree' /proc/meminfo | awk '{print $2}')
    MEM_BUFFERS=$(grep 'Buffers' /proc/meminfo | awk '{print $2}')
    MEM_CACHED=$(grep 'Cached' /proc/meminfo | awk '{print $2}')
    if [ "$MEM_TOTAL" -gt 0 ]; then
        MEM_USED=$((MEM_TOTAL - MEM_AVAIL))
        MEM_PERCENT=$(awk "BEGIN { printf \"%.1f\", ($MEM_USED / $MEM_TOTAL) * 100 }")
        MEM_TOTAL_MB=$((MEM_TOTAL / 1024))
        MEM_USED_MB=$((MEM_USED / 1024))
        MEM_AVAIL_MB=$((MEM_AVAIL / 1024))
    else
        MEM_PERCENT=0; MEM_TOTAL_MB=0; MEM_USED_MB=0; MEM_AVAIL_MB=0
    fi
    # Swap
    SWAP_TOTAL=$(grep 'SwapTotal' /proc/meminfo | awk '{print $2}')
    SWAP_FREE=$(grep 'SwapFree' /proc/meminfo | awk '{print $2}')
    if [ "$SWAP_TOTAL" -gt 0 ]; then
        SWAP_USED=$((SWAP_TOTAL - SWAP_FREE))
        SWAP_PERCENT=$(awk "BEGIN { printf \"%.1f\", ($SWAP_USED / $SWAP_TOTAL) * 100 }")
        SWAP_TOTAL_MB=$((SWAP_TOTAL / 1024))
        SWAP_USED_MB=$((SWAP_USED / 1024))
    else
        SWAP_PERCENT=0; SWAP_TOTAL_MB=0; SWAP_USED_MB=0
    fi
else
    MEM_PERCENT=0; MEM_TOTAL_MB=0; MEM_USED_MB=0; MEM_AVAIL_MB=0
    SWAP_PERCENT=0; SWAP_TOTAL_MB=0; SWAP_USED_MB=0
fi

# ── 磁盘 ──
DISKS=$(df -B1 --exclude-type=tmpfs --exclude-type=devtmpfs 2>/dev/null | tail -n +2 | awk '{
    total += $2; used += $3; avail += $4
} END {
    if (total > 0) printf "%.1f,%.0f,%.0f,%.0f", (used/total)*100, total/1073741824, used/1073741824, avail/1073741824
    else print "0,0,0,0"
}')
DISK_PERCENT=$(echo "$DISKS" | cut -d, -f1)
DISK_TOTAL_GB=$(echo "$DISKS" | cut -d, -f2)
DISK_USED_GB=$(echo "$DISKS" | cut -d, -f3)
DISK_AVAIL_GB=$(echo "$DISKS" | cut -d, -f4)

# ── 磁盘 IO ──
DISK_IO=$(cat /proc/diskstats 2>/dev/null | awk '$3 ~ /^(sd|nvme|vd|xvd|mmcblk)[a-z]/ && $3 !~ /[0-9]$/ {
    read_kb += $6*512/1024; write_kb += $10*512/1024; io_count += $4+$8
} END {
    printf "%.0f,%.0f,%.0f", read_kb, write_kb, io_count
}' || echo "0,0,0")

# ── 网卡流量 ──
NET_STATS=""
if [ -d /sys/class/net ]; then
    FIRST=true
    for IFACE in /sys/class/net/*; do
        IFNAME=$(basename "$IFACE")
        [ "$IFNAME" = "lo" ] && continue
        [ ! -f "$IFACE/statistics/rx_bytes" ] && continue
        RX=$(cat "$IFACE/statistics/rx_bytes" 2>/dev/null || echo 0)
        TX=$(cat "$IFACE/statistics/tx_bytes" 2>/dev/null || echo 0)
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            NET_STATS="$NET_STATS,"
        fi
        NET_STATS="$NET_STATS{\"iface\":\"$IFNAME\",\"rx_bytes\":$RX,\"tx_bytes\":$TX}"
    done
fi
[ -z "$NET_STATS" ] && NET_STATS=""

# ── 系统运行时间 ──
UPTIME=$(cat /proc/uptime 2>/dev/null | awk '{print $1}' || echo 0)
UPTIME_DAYS=$(awk "BEGIN { printf \"%.1f\", $UPTIME / 86400 }")

# ── 操作系统信息 ──
OS_INFO=""
[ -f /etc/os-release ] && OS_INFO=$(grep 'PRETTY_NAME' /etc/os-release | cut -d= -f2 | tr -d '"')
[ -z "$OS_INFO" ] && OS_INFO="Linux"
KERNEL=$(uname -r)

# ── 输出 JSON ──
cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "hostname": "$HOSTNAME",
  "os": "$OS_INFO",
  "kernel": "$KERNEL",
  "uptime_days": $UPTIME_DAYS,
  "cpu": {
    "usage_percent": $CPU_USAGE,
    "load_1m": $(echo $LOAD | cut -d, -f1),
    "load_5m": $(echo $LOAD | cut -d, -f2),
    "load_15m": $(echo $LOAD | cut -d, -f3),
    "processes": $PROCS
  },
  "memory": {
    "total_mb": $MEM_TOTAL_MB,
    "used_mb": $MEM_USED_MB,
    "available_mb": $MEM_AVAIL_MB,
    "usage_percent": $MEM_PERCENT,
    "swap_total_mb": $SWAP_TOTAL_MB,
    "swap_used_mb": $SWAP_USED_MB,
    "swap_percent": $SWAP_PERCENT
  },
  "disk": {
    "usage_percent": $DISK_PERCENT,
    "total_gb": $DISK_TOTAL_GB,
    "used_gb": $DISK_USED_GB,
    "available_gb": $DISK_AVAIL_GB,
    "io_read_kb": $(echo $DISK_IO | cut -d, -f1),
    "io_write_kb": $(echo $DISK_IO | cut -d, -f2),
    "io_count": $(echo $DISK_IO | cut -d, -f3)
  },
  "network": [$NET_STATS]
}
EOF
