import React from 'react'

interface DeployInfoProps {
  branchName?: string
  deployTime?: string
}

export default function DeployInfo({ branchName, deployTime }: DeployInfoProps): JSX.Element | null {
  if (!branchName || !deployTime) {
    return null
  }

  return (
    <div className="deploy-info">
      <div className="branch-name">{branchName}</div>
      <div className="deploy-time">{deployTime}</div>
    </div>
  )
}
