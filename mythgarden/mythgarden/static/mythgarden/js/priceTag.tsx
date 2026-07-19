import React from "react";

export default function PriceTag ({ amount }: PriceTagProps): JSX.Element {
  return (
      <div className="cost price-tag">⚜️{amount}</div>
  )
}

interface PriceTagProps {
  amount: number
}