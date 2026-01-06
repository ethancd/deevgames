import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../../src/App'

describe('App Component', () => {
  it('should render the title', () => {
    render(<App />)
    expect(screen.getByText('FORGE')).toBeInTheDocument()
  })

  it('should increment counter when button clicked', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /Test Counter: 0/i })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: /Test Counter: 1/i })).toBeInTheDocument()
  })
})
