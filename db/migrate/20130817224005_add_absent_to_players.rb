class AddAbsentToPlayers < ActiveRecord::Migration
  def change
    add_column :players, :absent, :boolean
  end
end
