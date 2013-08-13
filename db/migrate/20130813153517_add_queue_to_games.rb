class AddQueueToGames < ActiveRecord::Migration
  def change
    add_column :games, :queue, :boolean, default: false
  end
end
