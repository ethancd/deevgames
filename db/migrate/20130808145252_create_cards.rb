class CreateCards < ActiveRecord::Migration
  def change
    create_table :cards do |t|
      t.string :dir
      t.integer :value
      t.integer :player_id
      t.integer :game_id
      t.string :location
      t.boolean :shot, default: true

      t.timestamps
    end
  end
end
