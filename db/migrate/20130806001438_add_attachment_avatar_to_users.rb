class AddAttachmentAvatarToUsers < ActiveRecord::Migration
  def self.up
    change_table :users do |t|
      t.attachment :avatar
    end

    remove_column :users, :avatar_url
  end

  def self.down
    drop_attached_file :users, :avatar
    add_column :users, :avatar_url, :string
  end
end
