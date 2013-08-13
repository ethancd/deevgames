class ChangeResults < ActiveRecord::Migration
  def change
    add_column :games, :winner_id, :integer
    add_column :games, :loser_id, :integer
  end

end
