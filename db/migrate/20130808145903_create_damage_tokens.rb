class CreateDamageTokens < ActiveRecord::Migration
  def change
    create_table :damage_tokens do |t|
      t.integer :value
      t.integer :player_id
      t.integer :game_id
      t.boolean :fake, default: false

      t.timestamps
    end
  end
end
